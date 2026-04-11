import crypto from 'crypto';
import axios from 'axios';
import { generateInvoiceXML } from './xmlService.js';
import { signInvoice } from './sdkService.js';
import { reportInvoice, clearInvoice } from './zatcaService.js';
import { SecurityService } from './securityService.js';
import prisma from '../lib/prisma.js';

interface ExternalInvoice {
    invoiceNumber: string;
    issueDate: string;
    invoiceSubtype: 'Standard' | 'Simplified';
    totalAmount: number;
    vatAmount: number;
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

export const fetchAndProcessInvoices = async (sourceUrl: string, authHeader: string, vatNumber: string, environment?: string) => {
    console.log(`Fetching invoices from ${sourceUrl} for environment: ${environment || 'Default'}...`);

    try {
        // 1. Fetch from ERP
        const response = await axios.get(sourceUrl, {
            headers: { 'Authorization': authHeader }
        });

        if (environment?.toUpperCase() === 'SIMULATION') {
            console.log(`[Simulation] Response status: ${response.status} from ${sourceUrl}`);
            console.log(`[Simulation] Data snippet (Sanitized): ${sanitizePayload(response.data, 500)}...`);
        }

        // Support various JSON wrappers: .invoices, .data, .list, or direct array
        const invoices: ExternalInvoice[] = 
          response.data.invoices || 
          (Array.isArray(response.data.data) ? response.data.data : response.data.data?.rows || response.data.data?.list) || 
          response.data.list || 
          (Array.isArray(response.data) ? response.data : null);

          if (!invoices || !Array.isArray(invoices)) {
              console.error('[Integration] raw response (potential format error):', sanitizePayload(response.data, 500));
              const responseSnippet = sanitizePayload(response.data, 300);
              throw new Error(`Invalid response format: Expected array of invoices (checked .invoices, .data, .list). Received: ${responseSnippet}...`);
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
                invoiceSubtype: raw.invoiceSubtype || raw.invoice_subtype || (raw.customer?.vatNumber || raw.customer_vat ? 'Standard' : 'Simplified'),
                totalAmount: Number(raw.totalAmount || raw.total_amount || raw.total || 0),
                vatAmount: Number(raw.vatAmount || raw.vat_amount || raw.tax_amount || raw.tax || 0),
                customer: {
                    name: raw.customer?.name || raw.customer_name || raw.client_name || 'Cash Client',
                    vatNumber: raw.customer?.vatNumber || raw.customer_vat || raw.vat_number || null,
                    address: raw.customer?.address || raw.customer_address || raw.address || null,
                    city: raw.customer?.city || raw.customer_city || raw.city || 'Riyadh'
                },
                items: (raw.items || []).map((it: any) => ({
                    ...it,
                    name: it.name || it.description || it.item_name || it.item_description || 'Item',
                    quantity: Number(it.quantity || it.qty || it.count || 1),
                    unitPrice: Number(it.unitPrice || it.unit_price || it.price || it.rate || 0),
                    taxAmount: Number(it.taxAmount || it.tax_amount || it.vat_amount || it.tax || 0),
                    totalAmount: Number(it.totalAmount || it.total_amount || it.total || it.amount || 0),
                    nameAr: it.nameAr || it.arabicName || it.itemDescriptionArabic || it.item_name_ar || null,
                    description: it.description || it.itemDescription || it.name || 'Goods/Services'
                }))
            };
        };

        for (const rawInv of invoices) {
            const inv = normalizeInvoice(rawInv);
            try {
                console.log(`[Integration] Processing invoice ${inv.invoiceNumber} for company ${company.id}`);
                
                // Safety check: Skip mock/test invoices in production/sandbox unless explicitly allowed
                const isProductionMode = (environment || company.environment || 'SANDBOX').toLowerCase() !== 'simulation';
                const isMockInvoice = inv.invoiceNumber.startsWith('MOCK-') || inv.invoiceNumber.startsWith('TEST-');
                
                if (isProductionMode && isMockInvoice) {
                    console.warn(`[Integration] Skipping ${inv.invoiceNumber} - Mock invoices are not allowed in ${environment || 'Production'} mode.`);
                    results.push({ invoice: inv.invoiceNumber, status: 'Skipped (Mock Restricted)' });
                    continue;
                }

                // 4. Check if already processed (scoped to company)
                const existingInvoice = await prisma.invoice.findFirst({
                    where: { 
                        invoice_number: inv.invoiceNumber,
                        company_id: company.id
                    }
                });

                if (existingInvoice) {
                    results.push({ invoice: inv.invoiceNumber, status: 'Skipped (Already Exists)' });
                    continue;
                }

                // Get Previous Invoice Hash
                const lastInvoice = await prisma.invoice.findFirst({
                    where: { company_id: company.id },
                    orderBy: { id: 'desc' }
                });
                const pih = lastInvoice?.hash || 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMjRiZmQ3NTI0MjkzZjBlYTRiM2IzZTk4MTU1MWNiMA==';

                // Map External Invoice to ZATCA Schema
                const zatcaInvoice = {
                    ...inv,
                    uuid: crypto.randomUUID(),
                    documentType: 'Invoice',
                    currencyCode: 'SAR',
                    previousInvoiceHash: pih,
                    supplier: {
                        name: company.registered_name,
                        vatNumber: company.vat_number,
                        address: {
                            streetName: company.address || 'Unknown Street',
                            buildingNumber: '0000', // Default if unknown
                            cityName: company.city || 'Riyadh',
                            postalZone: '00000', // Default
                            countryCode: company.country || 'SA'
                        }
                    },
                    customer: {
                        name: inv.customer?.name || 'Cash Client',
                        vatNumber: inv.customer?.vatNumber || null,
                        address: {
                            streetName: inv.customer?.address || 'Unknown Street',
                            buildingNumber: '0000',
                            cityName: inv.customer?.city || 'Riyadh',
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
                const isSimulation = targetZatcaEnv === 'simulation';

                // Sign
                const signResult = await signInvoice(xml, certPem, decryptedPrivateKey, isSimulation);
                const signedXml = signResult.signedXml;
                const hash = signResult.hash;
                const qr = signResult.qr;

                // Report
                let result;
                
                if (inv.invoiceSubtype === 'Standard') {
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
                console.log(`[Integration] Attempting to create invoice ${inv.invoiceNumber} in DB...`);
                await prisma.invoice.create({
                    data: {
                        company_id: company.id,
                        invoice_number: inv.invoiceNumber,
                        uuid: zatcaInvoice.uuid,
                        date: new Date(inv.issueDate),
                        total_amount: inv.totalAmount,
                        tax_amount: inv.vatAmount,
                        status: result.clearanceStatus === 'CLEARED' ? 'CLEARED' : 
                                result.reportingStatus === 'REPORTED' ? 'REPORTED' : 'FAILED',
                        type: inv.invoiceSubtype === 'Standard' ? 'B2B' : 'B2C',
                        hash: hash,
                        xml_payload: Buffer.from(signedXml).toString('base64'),
                        qr_code: qr,
                        submission_response: JSON.stringify(result),
                        metadata: {
                            items: zatcaInvoice.items,
                            erp_raw: rawInv as any
                        }
                    }
                });

                results.push({ invoice: inv.invoiceNumber, status: 'Success', zatca: result });

                // NEW: Reflect status back to ERP in real-time
                await reflectStatusToERP(
                    company.id,
                    inv.invoiceNumber,
                    zatcaInvoice.uuid,
                    result.clearanceStatus === 'CLEARED' ? 'CLEARED' : (result.reportingStatus === 'REPORTED' ? 'REPORTED' : 'FAILED'),
                    result
                );

            } catch (err: any) {
                console.error(`Error processing invoice ${inv.invoiceNumber}:`, err.message);
                results.push({ invoice: inv.invoiceNumber, status: 'Failed', error: err.message });
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
        const erpConfigs = await prisma.erp_configuration.findMany({
            where: { company_id: companyId, is_active: true }
        });

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

        for (const config of erpConfigs) {
            // Use common path pattern /invoices/status
            const callbackUrl = `${config.base_url.replace(/\/$/, '')}/invoices/status`;
            
            console.log(`[ERP Status] Reflecting "${erpStatus}" for ${invoiceNumber} to ${callbackUrl}`);

            try {
                await axios.post(callbackUrl, {
                    invoiceNumber,
                    uuid,
                    status: erpStatus,
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
