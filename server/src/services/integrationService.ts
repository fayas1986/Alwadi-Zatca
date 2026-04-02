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

export const fetchAndProcessInvoices = async (sourceUrl: string, authHeader: string, vatNumber: string, environment?: string) => {
    console.log(`Fetching invoices from ${sourceUrl} for environment: ${environment || 'Default'}...`);

    try {
        // 1. Fetch from ERP
        const response = await axios.get(sourceUrl, {
            headers: { 'Authorization': authHeader }
        });

        if (environment?.toUpperCase() === 'SIMULATION') {
            console.log(`[Simulation] Response status: ${response.status} from ${sourceUrl}`);
            console.log(`[Simulation] Invoices found in payload: ${JSON.stringify(response.data).substring(0, 500)}...`);
        }

        // Support various JSON wrappers: .invoices, .data, .list, or direct array
        const invoices: ExternalInvoice[] = 
          response.data.invoices || 
          response.data.data || 
          response.data.list || 
          (Array.isArray(response.data) ? response.data : null);

          if (!invoices || !Array.isArray(invoices)) {
              console.error('[Integration] raw response:', response.data);
              throw new Error('Invalid response format: Expected array of invoices (checked .invoices, .data, .list)');
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

        for (const inv of invoices) {
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

                // Map External Invoice to ZATCA Schema (Simple mapping assumption)
                // In a real scenario, we might need a mapping layer/config
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
                        nameAr: it.nameAr || it.arabicName || it.itemDescriptionArabic || null,
                        description: it.description || it.itemDescription || null
                    }))
                };

                // Generate XML
                const xml = generateInvoiceXML(zatcaInvoice as any);

                // ── ZATCA Report / Clear ──
                // Determine if this is a simulation based on the environment
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
                            erp_raw: inv as any
                        }
                    }
                });

                results.push({ invoice: inv.invoiceNumber, status: 'Success', zatca: result });

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
