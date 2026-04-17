import { PrismaClient, Prisma } from '@prisma/client';
import { InvoiceService } from '../services/invoiceService.js';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function repairInvoices() {
    console.log('--- Starting Invoice Metadata & Customer Repair ---');

    // 1. Find all recently sync'd/problematic invoices for a clean sweep
    const allInvoices = await prisma.invoice.findMany({
        where: {
            OR: [
                { metadata: { equals: Prisma.DbNull } },
                { metadata: { equals: {} } },
                { customer_id: null }, // TARGET: Orphaned records
                { invoice_number: { startsWith: 'SAU/' } }
            ]
        }
    });

    console.log(`Analyzing ${allInvoices.length} invoices for repair/refresh...`);

    let repairedItemsCount = 0;
    let repairedCustomerCount = 0;

    for (const inv of allInvoices) {
        try {
            if (!inv.xml_payload) continue;

            let xmlContent = '';
            let recoveredItems: any[] = [];
            
            // ── Step A: Extract XML Content ──
            try {
                const trimmedPayload = inv.xml_payload.trim();
                if (trimmedPayload.startsWith('{')) {
                    const data = JSON.parse(trimmedPayload);
                    recoveredItems = data.items || [];
                } else if (trimmedPayload.startsWith('<?xml') || trimmedPayload.startsWith('<Invoice')) {
                    xmlContent = trimmedPayload;
                } else {
                    xmlContent = Buffer.from(trimmedPayload, 'base64').toString('utf8');
                    if (!xmlContent.includes('<Invoice')) xmlContent = trimmedPayload;
                }
            } catch (e) {
                xmlContent = inv.xml_payload;
            }

            // ── Step B: Recover Line Items (Regex) ──
            if (xmlContent.includes('<cac:InvoiceLine>')) {
                const itemMatches = xmlContent.matchAll(/<cac:InvoiceLine>([\s\S]*?)<\/cac:InvoiceLine>(?:\s*<cac:Price>([\s\S]*?)<\/cac:Price>)?/g);
                for (const match of itemMatches) {
                    const lineContent = match[1];
                    const priceContent = match[2] || "";
                    let nameMatch = lineContent.match(/<cbc:Name>([\s\S]*?)<\/cbc:Name>/);
                    if (!nameMatch) {
                        const siblingItemMatch = xmlContent.match(/<\/cac:InvoiceLine>\s*<cac:Item>[\s\S]*?<cbc:Name>([\s\S]*?)<\/cbc:Name>/);
                        if (siblingItemMatch) nameMatch = siblingItemMatch;
                    }

                    const qtyMatch = lineContent.match(/<cbc:InvoicedQuantity[\s\S]*?>([\d.]+)<\/cbc:InvoicedQuantity>/);
                    let priceMatch = lineContent.match(/<cbc:PriceAmount[\s\S]*?>([\d.]+)<\/cbc:PriceAmount>/);
                    if (!priceMatch && priceContent) priceMatch = priceContent.match(/<cbc:PriceAmount[\s\S]*?>([\d.]+)<\/cbc:PriceAmount>/);
                    const taxMatch = lineContent.match(/<cbc:Percent>([\d.]+)<\/cbc:Percent>/);
                    const lineTotalMatch = lineContent.match(/<cbc:LineExtensionAmount[\s\S]*?>([\d.]+)<\/cbc:LineExtensionAmount>/);

                    if (nameMatch) {
                        const qty = Number(qtyMatch?.[1] || 1);
                        const price = Number(priceMatch?.[1] || 0);
                        let vatRate = Number(taxMatch?.[1] || 15);
                        if (vatRate > 100) vatRate = vatRate / 100;
                        const subtotal = Number(lineTotalMatch?.[1] || (qty * price));
                        const vatAmount = subtotal * (vatRate / 100);

                        recoveredItems.push({
                            id: crypto.randomUUID(),
                            name: nameMatch[1].trim(),
                            quantity: qty,
                            unitPrice: price,
                            vatRate: vatRate,
                            vatAmount: Math.round(vatAmount * 100) / 100,
                            subtotal: subtotal,
                            total: Math.round((subtotal + vatAmount) * 100) / 100
                        });
                    }
                }
            }

            // ── Step C: Recover Customer Data (Regex) ──
            let customerData = null;
            if (xmlContent.includes('<cac:AccountingCustomerParty>')) {
                const customerPartyMatch = xmlContent.match(/<cac:AccountingCustomerParty>([\s\S]*?)<\/cac:AccountingCustomerParty>/);
                if (customerPartyMatch) {
                    const partyContent = customerPartyMatch[1];
                    const nameMatch = partyContent.match(/<cbc:RegistrationName>([\s\S]*?)<\/cbc:RegistrationName>/);
                    const vatMatch = partyContent.match(/<cbc:CompanyID[\s\S]*?>([\s\S]*?)<\/cbc:CompanyID>/);
                    if (nameMatch) {
                        customerData = {
                            name: nameMatch[1].trim(),
                            vatNumber: vatMatch ? vatMatch[1].trim() : null
                        };
                    }
                }
            }

            // ── Step D: Apply Repair ──
            if (recoveredItems.length > 0 || customerData) {
                let customerId = inv.customer_id;
                
                // Fetch linked customer name to check for mismatches
                let linkedCustomerName = "";
                if (customerId) {
                    const linked = await prisma.customer.findUnique({ where: { id: customerId } });
                    linkedCustomerName = linked?.name || "";
                }

                // If no ID, OR name mismatch, re-link
                if (customerData && (!customerId || linkedCustomerName !== customerData.name)) {
                    console.log(`[Repair] Invoice ${inv.invoice_number}: Resolving customer "${customerData.name}" (Current: "${linkedCustomerName || 'None'}")`);
                    customerId = await InvoiceService.getOrCreateCustomerId(inv.company_id, customerData);
                    if (customerId) repairedCustomerCount++;
                }

                await prisma.invoice.update({
                    where: { id: inv.id },
                    data: {
                        customer_id: customerId,

                        metadata: {
                            ...((inv.metadata as any) || {}),
                            items: recoveredItems.length > 0 ? recoveredItems : ((inv.metadata as any)?.items || []),
                            customer: customerData,
                            repair_info: {
                                repaired_at: new Date().toISOString(),
                                recovered_customer: !!customerData,
                                recovered_items: recoveredItems.length > 0
                            }
                        }
                    }
                });
                
                if (recoveredItems.length > 0) repairedItemsCount++;
                console.log(`[Success] Repaired ${inv.invoice_number}`);
            }

        } catch (err: any) {
            console.error(`[Error] Failed to repair invoice ${inv.invoice_number}:`, err.message);
        }
    }

    console.log(`--- Repair Complete ---`);
    console.log(`- Invoices with items fixed: ${repairedItemsCount}`);
    console.log(`- Invoices with customer linked: ${repairedCustomerCount}`);
}

repairInvoices().finally(() => prisma.$disconnect());


repairInvoices().finally(() => prisma.$disconnect());
