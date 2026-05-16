
import { invoice_status } from '@prisma/client';

export class ZatcaMappingService {
    /**
     * Map string environment to Prisma enum
     */
    static mapEnv(env: string) {
        switch (env?.toLowerCase()) {
            case 'simulation': return 'SIMULATION';
            case 'production': return 'PRODUCTION';
            case 'sandbox':
            default: return 'SANDBOX';
        }
    }

    /**
     * Map DB Status to Frontend Status
     */
    static mapStatusToFrontend(s: string): string {
        switch (s) {
            case 'CLEARED': return 'Cleared';
            case 'REPORTED': return 'Reported';
            case 'FAILED': return 'Failed';
            case 'SUBMITTED': return 'Reported'; // Map submitted to reported for UI
            default: return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
        }
    }

    /**
     * Map DB Invoice to Frontend Invoice interface
     */
    static mapInvoiceToFrontend(inv: any) {
        return {
            id: inv.id.toString(),
            branchId: `br-${inv.company_id}`,
            uuid: inv.uuid,
            invoiceNumber: inv.invoice_number,
            issueDate: inv.date.toISOString(),
            supplyDate: inv.date.toISOString(),
            invoiceSubtype: inv.type === 'B2B' ? 'Standard' : 'Simplified',
            documentType: 'Invoice',
            totalAmount: Number(inv.total_amount),
            vatAmount: Number(inv.tax_amount),
            taxExclusiveAmount: Number(inv.total_amount) - Number(inv.tax_amount),
            status: ZatcaMappingService.mapStatusToFrontend(inv.status || 'REPORTED'),
            qrCode: inv.qr_code,
            xmlContent: inv.xml_payload,
            zatcaResponse: (() => {
                if (!inv.submission_response) return null;
                try {
                    return typeof inv.submission_response === 'string'
                        ? JSON.parse(inv.submission_response)
                        : inv.submission_response;
                } catch (e) {
                    console.warn(`[ZATCA API] Failed to parse submission_response for invoice ${inv.id}:`, e);
                    return { status: 'ERROR', message: 'Malformed ZATCA response stored in DB' };
                }
            })(),
            supplier: {
                name: inv.company?.registered_name || 'Unknown Supplier',
                vatNumber: inv.company?.vat_number || 'N/A',
                address: {
                    streetName: inv.company?.street_name || inv.company?.address || '',
                    buildingNumber: inv.company?.building_number || '',
                    citySubdivisionName: inv.company?.city_subdivision || '',
                    cityName: inv.company?.city || '',
                    postalZone: inv.company?.postal_zone || '',
                    countryCode: inv.company?.country || 'SA'
                }
            },
            customer: inv.customer ? {
                name: inv.customer.name,
                vatNumber: inv.customer.vat_number || 'N/A',
                address: {
                    streetName: inv.customer.address || '',
                    cityName: inv.customer.city || '',
                    countryCode: inv.customer.country || 'SA'
                }
            } : {
                name: 'Unknown Customer',
                vatNumber: 'N/A',
                address: { streetName: '', cityName: '', countryCode: 'SA' }
            },
            items: (() => {
                // Priority 1: Direct items in metadata (Portal/Integration)
                if (inv.metadata?.items && Array.isArray(inv.metadata.items)) {
                    return inv.metadata.items;
                }
                
                // Priority 2: V2 Async Payload (invoiceLines)
                if (inv.metadata?.payload?.invoiceLines && Array.isArray(inv.metadata.payload.invoiceLines)) {
                    return inv.metadata.payload.invoiceLines.map((line: any) => ({
                        id: line.id || Math.random().toString(36).substr(2, 9),
                        name: line.itemName || 'Item',
                        quantity: Number(line.quantity || 0),
                        unitPrice: Number(line.unitPrice || 0),
                        discount: Number(line.discountAmount || 0),
                        vatRate: Number(line.taxCategory?.percent || 15),
                        vatAmount: Number(line.taxAmount || 0),
                        subtotal: Number(line.lineExtensionAmount || 0),
                        total: Number(line.lineExtensionAmount || 0) + Number(line.taxAmount || 0),
                        taxCategory: line.taxCategory?.id || 'S'
                    }));
                }

                // Priority 3: Fallback - Extract from XML (Recovery Mode)
                if (inv.xml_payload) {
                    try {
                        const xml = inv.xml_payload.startsWith('PD') // Basic base64 check
                            ? Buffer.from(inv.xml_payload, 'base64').toString('utf-8')
                            : inv.xml_payload;
                        
                        // Simple regex extraction for display recovery
                        const lines: any[] = [];
                        // Match InvoiceLine and optionally a following Price block (fallback for malformed XML)
                        const lineMatches = xml.matchAll(/<cac:InvoiceLine>([\s\S]*?)<\/cac:InvoiceLine>(?:\s*<cac:Price>([\s\S]*?)<\/cac:Price>)?/g);
                        for (const match of lineMatches) {
                            const content = match[1];
                            const priceContent = match[2];
                            
                            const name = content.match(/<cbc:Name>([\s\S]*?)<\/cbc:Name>/)?.[1] || 'Item';
                            const qty = content.match(/<cbc:InvoicedQuantity[^>]*>([\s\S]*?)<\/cbc:InvoicedQuantity>/)?.[1] || '0';
                            
                            // Check for PriceAmount inside the line, or in the fallback price block
                            const priceInside = content.match(/<cbc:PriceAmount[^>]*>([\s\S]*?)<\/cbc:PriceAmount>/)?.[1];
                            const priceOutside = priceContent?.match(/<cbc:PriceAmount[^>]*>([\s\S]*?)<\/cbc:PriceAmount>/)?.[1];
                            const price = priceInside || priceOutside || '0';

                            const subtotal = content.match(/<cbc:LineExtensionAmount[^>]*>([\s\S]*?)<\/cbc:LineExtensionAmount>/)?.[1] || '0';
                            const tax = content.match(/<cbc:TaxAmount[^>]*>([\s\S]*?)<\/cbc:TaxAmount>/)?.[1] || '0';
                            const taxCat = content.match(/<cac:ClassifiedTaxCategory>[\s\S]*?<cbc:ID>([\s\S]*?)<\/cbc:ID>/)?.[1] || 'S';

                            lines.push({
                                name: name.trim(),
                                quantity: Number(qty),
                                unitPrice: Number(price),
                                subtotal: Number(subtotal),
                                vatAmount: Number(tax),
                                total: Number(subtotal) + Number(tax),
                                taxCategory: taxCat
                            });
                        }
                        if (lines.length > 0) return lines;
                    } catch (e) {
                        console.warn(`[Recovery] Failed to extract items from XML for invoice ${inv.id}`);
                    }
                }

                return [];
            })(),
            history: [], 
            currencyCode: 'SAR'
        };
    }
}
