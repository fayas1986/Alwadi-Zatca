import * as crypto from 'crypto';
import axios from 'axios';
import { generateInvoiceXML } from './xmlService.js';
import { signInvoice } from './sdkService.js';
import { reportInvoice, clearInvoice } from './zatcaService.js';
import { SecurityService } from './securityService.js';
import prisma from '../lib/prisma.js';
import { parseInvoiceDate } from '../utils/dateUtils.js';
import { calculateInvoiceTotals } from '../utils/api-helpers.js';
import { InvoiceService } from './invoiceService.js';
import { WebhookService } from './webhookService.js';
import { AuditService } from './auditService.js';
import { D365Service } from './d365Service.js';
import { Invoice, InvoiceSubtype, DocumentType } from '../types.js';
import { invoice_status } from '@prisma/client';

interface ExternalInvoice {
    uuid?: string;
    invoiceNumber: string;
    issueDate: string;
    invoiceSubtype: InvoiceSubtype;
    documentType: DocumentType;
    billingReference?: any;
    instructionNote?: string;
    totalAmount: number;
    vatAmount: number;
    lineExtensionAmount?: number;
    taxExclusiveAmount?: number;
    taxInclusiveAmount?: number;
    payableAmount?: number;
    allowanceTotalAmount?: number;
    chargeTotalAmount?: number;
    prepaidAmount?: number;
    currencyCode?: string;
    supplyDate?: string;
    taxCategory?: string;
    customer: any;
    items: any[];
}

/**
 * Redacts sensitive PII from an object for logging/error reporting
 */
const sanitizePayload = (data: any, limit: number = 300): string => {
    if (typeof data === 'string') {
        const isHtml = data.trim().startsWith('<') || data.includes('<!DOCTYPE') || data.includes('<html>');
        return isHtml ? data.substring(0, limit) : data.substring(0, limit);
    }
    
    // Keys that likely contain PII or sensitive business data
    const sensitiveKeys = ['name', 'address', 'vat', 'customer', 'email', 'phone', 'mobile', 'street', 'city', 'post', 'building', 'contact'];
    
    const redact = (obj: any): any => {
        if (Array.isArray(obj)) return obj.slice(0, 3).map(redact); // Limit array samples
        if (obj !== null && typeof obj === 'object') {
            const newObj: any = {};
            for (const key in obj) {
                const isSensitive = sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()));
                if (isSensitive && typeof obj[key] !== 'object') {
                    newObj[key] = '[REDACTED]';
                } else {
                    newObj[key] = redact(obj[key]);
                }
            }
            return newObj;
        }
        return obj;
    };

    try {
        const redacted = redact(data);
        return JSON.stringify(redacted).substring(0, limit);
    } catch {
        return "[Error sanitizing payload]";
    }
};

export const fetchAndProcessInvoices = async (
    sourceUrl: string, 
    authHeader: string, 
    vatNumber: string, 
    environment?: string, 
    preFetchedInvoices?: any[]
) => {
    console.log(`Processing invoices for environment: ${environment || 'Default'} (preFetched: ${!!preFetchedInvoices})...`);

    try {
        let invoices: any[];

        if (preFetchedInvoices) {
            invoices = preFetchedInvoices;
        } else {
            // 1. Fetch from ERP
            let response;
            try {
                response = await axios.get(sourceUrl, {
                    headers: { 'Authorization': authHeader }
                });
            } catch (err: any) {
                 throw err;
            }

            if (environment?.toUpperCase() === 'SIMULATION') {
                console.log(`[Simulation] Response status: ${response.status} from ${sourceUrl}`);
                console.log(`[Simulation] Data snippet (Sanitized): ${sanitizePayload(response.data, 500)}...`);
            }

            // --- Smart Fetcher Logic for Factslite ---
            // If the URL is a token endpoint and returns a token instead of invoices, 
            // we exchange it and hit the actual data endpoint.
            if (sourceUrl.includes('/api/token') && response.data?.status === 'SUCCESS' && response.data?.token) {
                const dynamicToken = response.data.token;
                
                // Derive the data URL: replace /token with /zatca/fetchInvoices (common pattern for this vendor)
                // If this fails, we will try /api/invoices as a fallback
                const dataUrl = sourceUrl.replace('/api/token', '/api/zatca/fetchInvoices');
                
                console.log(`[Integration] Detected Token Response. Exchanging for data at ${dataUrl}...`);
                
                try {
                    const dataResponse = await axios.get(dataUrl, {
                        headers: { 'Authorization': `Bearer ${dynamicToken}` }
                    });
                    response = dataResponse; // Swap for the actual data response
                } catch (err: any) {
                    console.warn(`[Integration] Derived fetch failed at ${dataUrl}: ${err.message}. Trying direct /api/invoices fallback...`);
                    const fallbackUrl = sourceUrl.replace('/api/token', '/api/invoices');
                    try {
                        response = await axios.get(fallbackUrl, {
                            headers: { 'Authorization': `Bearer ${dynamicToken}` }
                        });
                    } catch (fallbackErr: any) {
                        console.error(`[Integration] All derived fetch attempts failed for Factslite. Setting empty result.`);
                        // Instead of throwing, we return a mock "empty" response to prevent SyncService crash
                        response = { data: { invoices: [] }, status: 200 };
                    }
                }
            }

            // Support various JSON wrappers: .invoices, .data, .list, or direct array
            invoices = 
              response.data.invoices || 
              (Array.isArray(response.data.data) ? response.data.data : response.data.data?.rows || response.data.data?.list) || 
              response.data.list || 
              (Array.isArray(response.data) ? response.data : null);

            if (!invoices || !Array.isArray(invoices)) {
                console.error('[Integration] raw response (potential format error):', sanitizePayload(response.data, 500));
                const responseSnippet = sanitizePayload(response.data, 300);
                throw new Error(`Invalid response format: Expected array of invoices (checked .invoices, .data, .list). Received: ${responseSnippet}...`);
            }
        }

        console.log(`Fetched ${invoices.length} invoices. Processing...`);

        const results = [];

        // 2. Process each invoice
        // Get Company Credentials once
        const company = await prisma.company.findUnique({
            where: { vat_number: vatNumber },
            include: { certificates: true }
        });

        if (!company) throw new Error(`Company with VAT ${vatNumber} not found`);
        
        // Find certificate matching the ERP environment, or fallback to any active cert
        let cert = company.certificates.find((c: any) => {
            if (!c.is_active) return false;
            if (!environment) return true;
            
            const certType = c.type.toUpperCase();
            const targetEnv = environment.toUpperCase();
            
            return certType === targetEnv;
        });
        
        // If still no exact match, fallback to any active cert
        if (!cert) cert = company.certificates.find((c: any) => c.is_active);
        
        if (!cert) {
            throw new Error(`No active certificate found for VAT ${vatNumber}. Please complete onboarding.`);
        }

        // Decrypt keys
        let certPem = '';
        let decryptedPrivateKey = '';
        let decryptedSecret = '';

        try {
                 // Check if key is actually encrypted (contains IV separator)
                 if (cert.private_key.includes(':')) {
                     decryptedPrivateKey = SecurityService.decrypt(cert.private_key);
                 } else {
                     decryptedPrivateKey = cert.private_key; // Assume plaintext fallback
                 }

                 if (cert.secret && cert.secret.includes(':')) {
                     decryptedSecret = SecurityService.decrypt(cert.secret);
                 } else {
                     decryptedSecret = cert.secret || '';
                 }

                 certPem = cert.certificate
                    .replace(/-----BEGIN CERTIFICATE-----/g, '')
                    .replace(/-----END CERTIFICATE-----/g, '')
                    .replace(/\s/g, '');

            } catch (e: any) {
                console.error("Decryption failed:", e.message);
                throw new Error("Failed to decrypt credentials. Please re-onboard.");
            }

        // Helper for robust mapping
        const normalizeInvoice = (raw: any): ExternalInvoice => {
            return {
                invoiceNumber: String(raw.invoiceNumber || raw.invoice_number || raw.id || raw.number || `ERP-${Date.now()}`),
                issueDate: raw.issueDate || raw.issue_date || raw.date || new Date().toISOString(),
                invoiceSubtype: (raw.invoiceSubtype || raw.invoice_subtype || (raw.customer?.vatNumber || raw.customer_vat ? 'STANDARD' : 'SIMPLIFIED')).toString().toUpperCase() as InvoiceSubtype,
                documentType: (raw.documentType || raw.document_type || raw.type || 'INVOICE').toString().toUpperCase().replace(/\s+/g, '_') as DocumentType,
                billingReference: raw.billingReference || raw.billing_reference || raw.original_invoice_number || raw.original_id || null,
                instructionNote: raw.instructionNote || raw.instruction_note || raw.reason || raw.refund_reason || null,
                totalAmount: Number(Number(raw.totalAmount || raw.total_amount || raw.total || 0).toFixed(2)),
                vatAmount: Number(Number(raw.vatAmount || raw.vat_amount || raw.tax_amount || raw.tax || 0).toFixed(2)),
                currencyCode: raw.currencyCode || raw.currency_code || raw.currency || 'SAR',
                supplyDate: raw.supplyDate || raw.supply_date || raw.delivery_date || raw.issueDate || raw.date || new Date().toISOString(),
                customer: {
                    name: raw.customer?.name || raw.customer_name || raw.client_name || 'Cash Client',
                    vatNumber: raw.customer?.vatNumber || raw.customer_vat || raw.vat_number || null,
                    address: (() => {
                        const addr = raw.customer?.address || raw.customer_address || raw.address;
                        if (!addr) return null;
                        if (typeof addr === 'string') {
                            return {
                                streetName: addr.substring(0, 50),
                                cityName: raw.customer?.city || 'Riyadh',
                                countryCode: 'SA'
                            };
                        }
                        return {
                            streetName: addr.streetName || addr.street_name || addr.street || 'Test Street',
                            buildingNumber: addr.buildingNumber || addr.building_number || addr.building || '1',
                            cityName: addr.cityName || addr.city_name || addr.city || raw.customer?.city || 'Riyadh',
                            postalZone: addr.postalZone || addr.postal_zone || addr.zip || addr.postcode || '12345',
                            countryCode: addr.countryCode || addr.country_code || addr.country || 'SA'
                        };
                    })(),
                    city: raw.customer?.city || raw.customer_city || raw.city || 'Riyadh'
                },
                items: (raw.items || []).map((it: any) => {
                    // --- Normalize taxCategory to a valid ZATCA code string ---
                    // ERPs sometimes send the VAT amount (e.g. 65.22) in this field by mistake.
                    // Valid ZATCA codes: "S" (Standard), "Z" (Zero-rated), "E" (Exempt), "O" (Out of scope)
                    const rawTaxCat = it.taxCategory;
                    let taxCategoryCode: string;
                    if (typeof rawTaxCat === 'string' && ['S', 'Z', 'E', 'O'].includes(rawTaxCat.toUpperCase())) {
                        taxCategoryCode = rawTaxCat.toUpperCase();
                    } else {
                        // Fallback: derive from vatRate or default to Standard
                        const rate = Number(it.vatRate || 0);
                        if (rate === 0) taxCategoryCode = 'Z';
                        else taxCategoryCode = 'S'; // 15% = Standard
                    }

                    // --- Normalize vatRate to a clean percentage (not a fraction) ---
                    // e.g. 15.000690004140026 → 15.00, 0.15 → 15.00
                    let rawRate = Number(it.vatRate || 0);
                    if (rawRate > 0 && rawRate < 1) rawRate = rawRate * 100; // convert fraction to %
                    const vatRate = Math.round(rawRate * 100) / 100; // round to 2dp

                    // --- Resolve taxAmount correctly ---
                    // Some ERPs incorrectly place the VAT *amount* in the taxCategory field.
                    // If taxAmount/tax fields are missing but taxCategory is numeric, use it as the amount.
                    const numericTaxCatAsAmount = typeof rawTaxCat === 'number' ? rawTaxCat : 0;
                    const taxAmount = Number(
                        it.taxAmount || it.tax_amount || it.vat_amount || it.tax || numericTaxCatAsAmount || 0
                    );

                    const qty = Number(it.quantity || it.qty || it.count || 1);
                    const price = Number(it.unitPrice || it.unit_price || it.price || it.rate || 0);
                    const subtotal = qty * price;
                    // Gross line total (including VAT) — used directly by the receipt renderer
                    const lineTotalGross = Number(
                        it.total ?? it.totalAmount ?? it.total_amount ?? it.amount ?? (subtotal + taxAmount)
                    );

                    return {
                        ...it,
                        name: it.name || it.description || it.item_name || it.item_description || 'Item',
                        quantity: qty,
                        unitPrice: Number(price.toFixed(2)),
                        subtotal: Number(subtotal.toFixed(2)),
                        taxCategory: taxCategoryCode,
                        vatRate,
                        taxAmount: Number(taxAmount.toFixed(2)),
                        total: Number(lineTotalGross.toFixed(2)),
                        totalAmount: Number(lineTotalGross.toFixed(2)),
                        nameAr: it.nameAr || it.arabicName || it.itemDescriptionArabic || it.item_name_ar || null,
                        description: it.description || it.itemDescription || it.name || 'Goods/Services'
                    };
                }),
                taxCategory: raw.taxCategory || raw.tax_category || (raw.items?.[0]?.taxCategory || 'S')
            };
        };

        for (const rawInv of invoices) {
            let invNumberFallback = rawInv.invoiceNumber || rawInv.invoice_number || rawInv.id || 'UNKNOWN';
            try {
                let inv: any = normalizeInvoice(rawInv);
                invNumberFallback = inv.invoiceNumber;
                
                // Recalculate totals if missing (tax-first approach)
                inv = calculateInvoiceTotals(inv);

                // IDEMPOTENCY/UPDATE LOGIC: 
                const existing = await prisma.invoice.findFirst({
                    where: {
                        company_id: company.id,
                        invoice_number: inv.invoiceNumber
                    }
                });

                const isSimulation = (environment || company.environment || 'SANDBOX').toLowerCase() === 'simulation';
                
                if (existing && !isSimulation) {
                    console.log(`[Integration] Invoice ${inv.invoiceNumber} already exists in database. Skipping.`);
                    results.push({ invoiceNumber: inv.invoiceNumber, status: 'skipped', reason: 'Already exists' });
                    continue;
                }
                const parsedDate = parseInvoiceDate(inv.issueDate);

                console.log(`[Integration] Processing invoice ${inv.invoiceNumber} for company ${company.id} (Date: ${parsedDate.toISOString()})`);
                
                // Safety check: Skip mock/test invoices in production/sandbox unless explicitly allowed
                const isProductionMode = (environment || company.environment || 'SANDBOX').toLowerCase() !== 'simulation';
                const isMockInvoice = inv.invoiceNumber.startsWith('MOCK-') || inv.invoiceNumber.startsWith('TEST-');
                
                if (isProductionMode && isMockInvoice) {
                    console.warn(`[Integration] Skipping ${inv.invoiceNumber} - Mock invoices are not allowed in ${environment || 'Production'} mode.`);
                    results.push({ invoice: inv.invoiceNumber, status: 'Skipped (Mock Restricted)' });
                    continue;
                }

                // Redundant check removed.

                // Get Previous Invoice Hash (Requirement: Chain to the last SUCCESSFUL invoice)
                const lastInvoice = await prisma.invoice.findFirst({
                    where: { 
                        company_id: company.id,
                        status: { in: ['CLEARED', 'REPORTED'] }
                    },
                    orderBy: { id: 'desc' }
                });
                const pih = lastInvoice?.hash || 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMjRiZmQ3NTI0MjkzZjBlYTRiM2IzZTk4MTU1MWNiMA==';

                // Map External Invoice to ZATCA Schema
                const zatcaInvoice = {
                    ...inv,
                    issueDate: parsedDate.toISOString(),
                    supplyDate: inv.supplyDate || parsedDate.toISOString(),
                    uuid: existing?.uuid || inv.uuid || crypto.randomUUID(), // Use DB UUID if available
                    documentType: inv.documentType || 'INVOICE',
                    billingReference: inv.billingReference,
                    instructionNote: inv.instructionNote,
                    currencyCode: inv.currencyCode || 'SAR',
                    previousInvoiceHash: pih,
                    // Ensure mandatory ZATCA monetary fields are present (from recalculated 'inv')
                    lineExtensionAmount: inv.lineExtensionAmount,
                    taxExclusiveAmount: inv.taxExclusiveAmount,
                    taxInclusiveAmount: inv.taxInclusiveAmount,
                    payableAmount: inv.payableAmount,
                    allowanceTotalAmount: inv.allowanceTotalAmount,
                    chargeTotalAmount: inv.chargeTotalAmount,
                    prepaidAmount: inv.prepaidAmount,
                    supplier: {
                        name: company.registered_name,
                        vatNumber: company.vat_number,
                        address: {
                            streetName: company.street_name || company.address || 'Unknown Street',
                            buildingNumber: company.building_number || '0000',
                            cityName: company.city || 'Riyadh',
                            postalZone: company.postal_zone || '00000',
                            countryCode: company.country || 'SA'
                        }
                    },
                    customer: {
                        name: inv.customer?.name || 'Cash Client',
                        vatNumber: inv.customer?.vatNumber || null,
                        address: inv.customer?.address || {
                            streetName: 'Unknown Street',
                            buildingNumber: '0000',
                            cityName: 'Riyadh',
                            postalZone: '00000',
                            countryCode: 'SA'
                        }
                    },
                    items: inv.items.map((it: any) => ({
                        ...it,
                        name: it.name || 'Item',
                        nameAr: it.nameAr || null,
                        description: it.description || it.name || 'Goods/Services'
                    }))
                };

                // Generate XML
                const xml = generateInvoiceXML(zatcaInvoice as any);

                // ── ZATCA Report / Clear ──
                const targetZatcaEnv = (environment || company.environment || 'SANDBOX').toLowerCase();

                // Sign
                const signResult = await signInvoice(xml, certPem, decryptedPrivateKey, isSimulation);
                const signedXml = signResult.signedXml;
                const hash = signResult.hash;
                const qr = signResult.qr;

                // Report
                let result;
                
                if (inv.invoiceSubtype === 'STANDARD') {
                    result = await clearInvoice(
                        targetZatcaEnv,
                        cert.csid,
                        decryptedSecret,
                        hash,
                        Buffer.from(signedXml).toString('base64'),
                        zatcaInvoice.uuid
                    );
                } else {
                    result = await reportInvoice(
                        targetZatcaEnv,
                        cert.csid,
                        decryptedSecret,
                        hash,
                        Buffer.from(signedXml).toString('base64'),
                        zatcaInvoice.uuid
                    );
                }
                
                if (isSimulation) {
                    console.log(`[Simulation] ZATCA Response for ${inv.invoiceNumber}:`, JSON.stringify(result, null, 2));
                    if (result.validationResults?.warningMessages) {
                         console.warn(`[Simulation] ZATCA Warnings for ${inv.invoiceNumber}:`, result.validationResults.warningMessages);
                    }
                }
                
                // Save to Database
                // Save to Database
                console.log(`[Integration] Saving invoice ${inv.invoiceNumber} to DB (Update: ${!!existing})`);
                
                const invoiceData = {
                    company_id: company.id,
                    invoice_number: inv.invoiceNumber,
                    uuid: zatcaInvoice.uuid,
                    date: parsedDate,
                    total_amount: inv.totalAmount,
                    tax_amount: inv.vatAmount,
                    status: (result.clearanceStatus === 'CLEARED' ? 'CLEARED' : 
                            result.reportingStatus === 'REPORTED' ? 'REPORTED' : 'FAILED') as invoice_status,
                    type: (inv.invoiceSubtype === 'STANDARD' ? 'B2B' : 'B2C') as 'B2B' | 'B2C',
                    hash: hash,
                    xml_payload: Buffer.from(signedXml).toString('base64'),
                    qr_code: qr,
                    submission_response: JSON.stringify(result),
                    metadata: {
                        erp_raw: rawInv as any,
                        items: zatcaInvoice.items,
                        customer: zatcaInvoice.customer,
                        updated_at: new Date().toISOString()
                    }
                };

                if (existing && isSimulation) {
                    await InvoiceService.updateInvoice(existing.id, invoiceData);
                } else {
                    await InvoiceService.createInvoice(invoiceData);
                }


                results.push({ invoice: inv.invoiceNumber, status: 'Success', zatca: result });

                const finalStatus = result.clearanceStatus === 'CLEARED' ? 'CLEARED' : (result.reportingStatus === 'REPORTED' ? 'REPORTED' : 'FAILED');

                // ── Compliance Audit Forensics ──
                await AuditService.log({
                    action: 'ZATCA_SYNC_SUCCESS',
                    category: 'Compliance',
                    user: 'System-Sync',
                    role: 'SYSTEM',
                    ipAddress: '127.0.0.1',
                    status: 'Success',
                    details: `Successfully synced invoice ${inv.invoiceNumber} to ZATCA.`,
                    resourceId: inv.invoiceNumber,
                    payload: result.clearedInvoice || Buffer.from(signedXml).toString('base64'),
                    metadata: { 
                        uuid: zatcaInvoice.uuid,
                        zatcaResponse: result 
                    }
                });

                // NEW: Reflect status back to ERP in real-time
                await reflectStatusToERP(
                    company.id,
                    inv.invoiceNumber,
                    zatcaInvoice.uuid,
                    finalStatus,
                    result
                );

            } catch (err: any) {
                console.error(`Error processing invoice ${invNumberFallback}:`, err.message);
                results.push({ invoice: invNumberFallback, status: 'Failed', error: err.message });
                
                // Reflect failure/rejection back to ERP in real-time so it can be corrected and pushed again!
                try {
                    await reflectStatusToERP(
                        company.id,
                        invNumberFallback,
                        existing?.uuid || crypto.randomUUID(),
                        'FAILED',
                        { message: err.message }
                    );
                } catch (reflectErr: any) {
                    console.error(`[Integration] Failed to reflect processing error to ERP:`, reflectErr.message);
                }
            }
        }

        return results;

    } catch (error: any) {
        console.error('Integration Error:', error.message);
        throw new Error(`ERP Integration Failed: ${error.message}`);
    }
};

/**
 * Reflects the ZATCA status of an invoice back to the external ERP.
 */
export const reflectStatusToERP = async (companyId: number, invoiceNumber: string, uuid: string, status: string, zatcaResponse?: any) => {
    try {
        const allConfigs = await prisma.erp_configuration.findMany({
            where: { company_id: companyId, is_active: true }
        });

        // De-duplicate configs by base_url to prevent multiple calls to the same system
        const erpConfigs = Array.from(
            new Map(allConfigs.map(c => [c.base_url.toLowerCase().trim(), c])).values()
        );

        if (erpConfigs.length === 0) {
            console.log(`[ERP Status] No active ERP configurations for company ${companyId}.`);
            return;
        }

        // Map status to ERP friendly names (Requirement: rejected, pending, cleared, Reported)
        let erpStatus = status.toLowerCase();
        if (status === 'DLQ' || status === 'FAILED') erpStatus = 'rejected';
        if (status === 'CLEARED') erpStatus = 'cleared';
        if (status === 'REPORTED') erpStatus = 'reported';
        if (status === 'PENDING') erpStatus = 'pending';

        // Enhanced Error Summary for Rejections
        let rejectionReason = null;
        if (erpStatus === 'rejected' && zatcaResponse?.validationResults) {
            const errors = zatcaResponse.validationResults.filter((r: any) => r.type === 'ERROR');
            if (errors.length > 0) {
                rejectionReason = errors.map((e: any) => `[${e.code}] ${e.message}`).join('; ');
            }
        }

        // 2. Relay via Modern HMAC Webhook Service (Centralized)
        const eventMap: Record<string, string> = {
            'cleared': 'INVOICE_CLEARED',
            'reported': 'INVOICE_REPORTED',
            'rejected': 'INVOICE_REJECTED',
            'pending': 'INVOICE_PROCESSING'
        };

        const webhookEvent = eventMap[erpStatus];
        if (webhookEvent) {
            console.log(`[Webhook] Relaying ${webhookEvent} via WebhookService...`);
            // Fire and forget (WebhookService handles retries internally)
            WebhookService.sendWebhook(companyId, webhookEvent, {
                uuid,
                invoiceNumber,
                status: erpStatus.toUpperCase(),
                zatcaResponse
            }).catch(err => console.error('[Webhook] Service call failed:', err.message));
        }

        // 3. Relay via Callback
        for (const config of erpConfigs) {
            if (config.type === 'D365' || (config.type === 'MICROSOFT' && !config.base_url.includes('mock-server'))) {
                console.log(`[ERP Status] Reflecting status for ${invoiceNumber} to D365...`);
                try {
                    const d365Config = {
                        clientId: config.id,
                        clientSecret: process.env.D365_CLIENT_SECRET || config.api_key || '',
                        tenantId: process.env.D365_TENANT_ID || 'common',
                        baseUrl: config.base_url
                    };
                    await D365Service.pushStatusUpdate(d365Config, {
                        invoiceNumber,
                        uuid,
                        status: erpStatus.toUpperCase(),
                        rejectionReason: rejectionReason || (zatcaResponse?.message || null),
                        zatcaResponse
                    });
                } catch (err: any) {
                    console.warn(`[ERP Status] Failed to update D365 status: ${err.message}`);
                }
                continue;
            }

            // Use URL object to safely append path even if query params exist
            let callbackUrl: string;
            try {
                const urlObj = new URL(config.base_url);
                urlObj.pathname = `${urlObj.pathname.replace(/\/$/, '')}/invoices/status`.replace(/\/+/g, '/');
                callbackUrl = urlObj.toString();
            } catch {
                callbackUrl = `${config.base_url.replace(/\/$/, '')}/invoices/status`;
            }
            
            console.log(`[ERP Status] Reflecting "${erpStatus}" for ${invoiceNumber} to ${callbackUrl}`);

            try {
                await axios.post(callbackUrl, {
                    invoiceNumber,
                    uuid,
                    status: erpStatus,
                    rejectionReason, // Added detailed error for ERP to display
                    timestamp: new Date().toISOString(),
                    zatcaResponse: zatcaResponse || {}
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': config.api_key || ''
                    },
                    timeout: 10000 // 10s for slow ERPs
                });
                console.log(`[ERP Status] Successfully updated ${invoiceNumber} on ERP.`);
            } catch (err: any) {
                console.warn(`[ERP Status] Failed to update ERP at ${callbackUrl}: ${err.message}`);
                // Optional: Link to a generic system event or audit log
            }
        }
    } catch (error: any) {
        console.error('[ERP Status] Global reflection failure:', error.message);
    }
};
