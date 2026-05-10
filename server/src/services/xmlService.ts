
import { create } from 'xmlbuilder2';
import { appendFileSync } from 'fs';
import { Invoice } from '../types.js';
import crypto from 'crypto';
import { signInvoice as signInvoiceSDK } from './sdkService.js';
import { getKSATimestamp, INITIAL_PIH } from '../utils/api-helpers.js';

const safeNum = (v: any) => Number(v) || 0;

export const generateInvoiceXML = (invoice: Invoice) => {
    // 1. Unified Math (Halala-based to avoid float drift)
    const toHalala = (n: number) => Math.round((n + Number.EPSILON) * 100);
    const fromHalala = (n: number) => (n / 100).toFixed(2);
    
    let totalExclusiveHalala = 0;
    let totalVatHalala = 0;
    const taxSubtotals: Record<string, { taxableHalala: number, taxHalala: number, rate: number, category: string }> = {};

    const items = (Array.isArray(invoice.items) ? invoice.items : []).map((it, idx) => {
        const qty = safeNum(it.quantity);
        const price = safeNum(it.unitPrice);
        const discount = safeNum(it.discount);
        const rate = safeNum(it.vatRate || it.taxRate || 0.15);
        const ratePercent = rate < 1 ? rate * 100 : rate;
        const category = it.taxCategory || it.taxCategoryCode || 'S';

        const grossHalala = toHalala(qty * price);
        const discountHalala = toHalala(discount);
        const lineNetHalala = grossHalala - discountHalala;
        const lineVatHalala = Math.round((lineNetHalala * ratePercent) / 100);

        totalExclusiveHalala += lineNetHalala;
        totalVatHalala += lineVatHalala;

        // Group for TaxSubtotal
        const key = `${category}_${ratePercent.toFixed(2)}`;
        if (!taxSubtotals[key]) {
            taxSubtotals[key] = { taxableHalala: 0, taxHalala: 0, rate: ratePercent, category };
        }
        taxSubtotals[key].taxableHalala += lineNetHalala;
        taxSubtotals[key].taxHalala += lineVatHalala;

        return {
            ...it,
            lineNetStr: fromHalala(lineNetHalala),
            lineVatStr: fromHalala(lineVatHalala),
            ratePercentStr: ratePercent.toFixed(2),
            category,
            qtyStr: qty.toString(),
            priceStr: price.toFixed(2)
        };
    });

    const totalInclusiveHalala = totalExclusiveHalala + totalVatHalala;

    const ksaTimestamp = getKSATimestamp(invoice.issueDate ? new Date(invoice.issueDate) : undefined);
    const [datePart, timeWithOffset] = ksaTimestamp.split('T');
    const timePart = timeWithOffset.split('+')[0].split('.')[0]; // HH:mm:ss

    try {
        const isStandard = invoice.invoiceSubtype === 'STANDARD';
        const typeCode = invoice.documentType === 'CREDIT_NOTE' ? '381' : (invoice.documentType === 'DEBIT_NOTE' ? '383' : '388');
        const subtypeCode = isStandard ? '0100000' : '0200000';

        const xml = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('Invoice', {
                'xmlns': 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
                'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
                'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
                'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
                'xmlns:sig': 'urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2',
                'xmlns:sac': 'urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2',
                'xmlns:sbc': 'urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2',
                'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#'
            })
            .ele('cbc:ProfileID').txt(isStandard ? 'clearance:1.0' : 'reporting:1.0').up()
            .ele('cbc:ID').txt(invoice.invoiceNumber).up()
            .ele('cbc:UUID').txt(invoice.uuid || crypto.randomUUID()).up()
            .ele('cbc:IssueDate').txt(datePart).up()
            .ele('cbc:IssueTime').txt(timePart).up()
            .ele('cbc:InvoiceTypeCode', { name: subtypeCode }).txt(typeCode).up()
            .ele('cbc:Note').txt(invoice.instructionNote || 'This is a computer generated invoice').up()
            .ele('cbc:DocumentCurrencyCode').txt(invoice.currencyCode || 'SAR').up()
            .ele('cbc:TaxCurrencyCode').txt('SAR').up()

            // Previous Invoice Hash (PIH)
            .ele('cac:AdditionalDocumentReference')
            .ele('cbc:ID').txt('PIH').up()
            .ele('cac:Attachment')
            .ele('cbc:EmbeddedDocumentBinaryObject', { mimeCode: 'text/plain' })
            .txt(invoice.previousInvoiceHash || INITIAL_PIH)
            .up()
            .up()
            .up();

        // Billing Reference (Mandatory for Credit/Debit Notes)
        if (invoice.billingReference) {
            const br = invoice.billingReference;
            const brId = typeof br === 'string' ? br : br.id;
            const brNode = xml.ele('cac:BillingReference')
                .ele('cac:InvoiceDocumentReference');
            
            brNode.ele('cbc:ID').txt(brId).up();
            
            if (typeof br !== 'string' && br.issueDate) {
                brNode.ele('cbc:IssueDate').txt(br.issueDate).up();
            }
            if (typeof br !== 'string' && br.uuid) {
                brNode.ele('cbc:UUID').txt(br.uuid).up();
            }
        }

        // Supplier
        xml.ele('cac:AccountingSupplierParty')
            .ele('cac:Party')
            .ele('cac:PartyIdentification')
            .ele('cbc:ID', { schemeID: 'CRN' }).txt(invoice.supplier?.crNumber || '1010010000').up()
            .up()
            .ele('cac:PostalAddress')
            .ele('cbc:StreetName').txt(invoice.supplier?.address?.streetName || 'Unknown').up()
            .ele('cbc:BuildingNumber').txt(invoice.supplier?.address?.buildingNumber || '0000').up()
            .ele('cbc:CitySubdivisionName').txt(invoice.supplier?.address?.citySubdivisionName || invoice.supplier?.address?.cityName || 'Riyadh').up()
            .ele('cbc:CityName').txt(invoice.supplier?.address?.cityName || 'Riyadh').up()
            .ele('cbc:PostalZone').txt(invoice.supplier?.address?.postalZone || '12345').up()
            .ele('cbc:CountrySubentity').txt(invoice.supplier?.address?.cityName || 'Riyadh').up()
            .ele('cac:Country')
            .ele('cbc:IdentificationCode').txt('SA').up()
            .up()
            .up()
            .ele('cac:PartyTaxScheme')
            .ele('cbc:CompanyID').txt(invoice.supplier?.vatNumber || '300000000000003').up()
            .ele('cac:TaxScheme')
            .ele('cbc:ID').txt('VAT').up()
            .up()
            .up()
            .ele('cac:PartyLegalEntity')
            .ele('cbc:RegistrationName').txt(invoice.supplier?.registrationName || invoice.supplier?.name || 'Tech Solutions Ltd').up()
            .up()
            .up()
            .up()

            // Customer
            .ele('cac:AccountingCustomerParty')
            .ele('cac:Party')
            .ele('cac:PostalAddress')
            .ele('cbc:StreetName').txt(invoice.customer?.address?.streetName || 'Unknown').up()
            .ele('cbc:BuildingNumber').txt(invoice.customer?.address?.buildingNumber || '0000').up()
            .ele('cbc:CitySubdivisionName').txt(invoice.customer?.address?.citySubdivisionName || invoice.customer?.address?.cityName || 'Riyadh').up()
            .ele('cbc:CityName').txt(invoice.customer?.address?.cityName || 'Riyadh').up()
            .ele('cbc:PostalZone').txt(invoice.customer?.address?.postalZone || '12345').up()
            .ele('cac:Country')
            .ele('cbc:IdentificationCode').txt('SA').up()
            .up()
            .up()
            .ele('cac:PartyTaxScheme')
            .ele('cbc:CompanyID').txt(invoice.customer?.vatNumber || '300000000000003').up()
            .ele('cac:TaxScheme')
            .ele('cbc:ID').txt('VAT').up()
            .up()
            .up()
            .ele('cac:PartyLegalEntity')
            .ele('cbc:RegistrationName').txt(invoice.customer?.name || 'Cash Client').up()
            .up()
            .up()
            .up();

        // Tax Total Section
        const taxTotalNode = xml.ele('cac:TaxTotal');
        taxTotalNode.ele('cbc:TaxAmount', { currencyID: 'SAR' }).txt(fromHalala(totalVatHalala)).up();
        
        Object.values(taxSubtotals).forEach(sub => {
            taxTotalNode.ele('cac:TaxSubtotal')
                .ele('cbc:TaxableAmount', { currencyID: 'SAR' }).txt(fromHalala(sub.taxableHalala)).up()
                .ele('cbc:TaxAmount', { currencyID: 'SAR' }).txt(fromHalala(sub.taxHalala)).up()
                .ele('cac:TaxCategory')
                    .ele('cbc:ID').txt(sub.category).up()
                    .ele('cbc:Percent').txt(sub.rate.toFixed(2)).up()
                    .ele('cac:TaxScheme')
                        .ele('cbc:ID').txt('VAT').up()
                    .up()
                .up()
            .up();
        });
        taxTotalNode.up();

        // Legal Monetary Totals (ZATCA Full Breakdown Requirement)
        xml.ele('cac:LegalMonetaryTotal')
            .ele('cbc:LineExtensionAmount', { currencyID: 'SAR' }).txt(fromHalala(totalExclusiveHalala)).up()
            .ele('cbc:TaxExclusiveAmount', { currencyID: 'SAR' }).txt(fromHalala(totalExclusiveHalala)).up()
            .ele('cbc:TaxInclusiveAmount', { currencyID: 'SAR' }).txt(fromHalala(totalInclusiveHalala)).up()
            .ele('cbc:AllowanceTotalAmount', { currencyID: 'SAR' }).txt('0.00').up()
            .ele('cbc:ChargeTotalAmount', { currencyID: 'SAR' }).txt('0.00').up()
            .ele('cbc:PayableAmount', { currencyID: 'SAR' }).txt(fromHalala(totalInclusiveHalala)).up()
            .up();


        // Map items...
        items.forEach((item, index) => {
            xml.ele('cac:InvoiceLine')
                .ele('cbc:ID').txt((index + 1).toString()).up()
                .ele('cbc:InvoicedQuantity', { unitCode: 'PCE' }).txt(item.qtyStr).up()
                .ele('cbc:LineExtensionAmount', { currencyID: 'SAR' }).txt(item.lineNetStr).up()
                
                .ele('cac:TaxTotal')
                    .ele('cbc:TaxAmount', { currencyID: 'SAR' }).txt(item.lineVatStr).up()
                    .ele('cac:TaxSubtotal')
                        .ele('cbc:TaxableAmount', { currencyID: 'SAR' }).txt(item.lineNetStr).up()
                        .ele('cbc:TaxAmount', { currencyID: 'SAR' }).txt(item.lineVatStr).up()
                        .ele('cac:TaxCategory')
                            .ele('cbc:ID').txt(item.category).up()
                            .ele('cbc:Percent').txt(item.ratePercentStr).up()
                            .ele('cac:TaxScheme')
                                .ele('cbc:ID').txt('VAT').up()
                            .up() // Close TaxScheme
                        .up() // Close TaxCategory
                    .up() // Close TaxSubtotal
                .up() // Close TaxTotal

                .ele('cac:Item')
                    .ele('cbc:Name').txt(item.name || 'Item').up()
                    .ele('cac:ClassifiedTaxCategory')
                        .ele('cbc:ID').txt(item.category).up()
                        .ele('cbc:Percent').txt(item.ratePercentStr).up()
                        .ele('cac:TaxScheme')
                            .ele('cbc:ID').txt('VAT').up()
                        .up() // Close TaxScheme
                    .up() // Close ClassifiedTaxCategory
                .up() // Close Item
                
                .ele('cac:Price')
                    .ele('cbc:PriceAmount', { currencyID: 'SAR' }).txt(item.priceStr).up()
                .up() // Close Price
            .up(); // Close InvoiceLine
        });

        return xml.end({ prettyPrint: true });
    } catch (err: any) {
        throw new Error(err?.message || 'Unknown XML generation error');
    }
};

export const computeXMLHash = (xmlContent: string) => {
    // Canonicalize XML if possible, but for ZATCA simplified hash is usually SHA256 of the content
    // Note: To match SDK, we usually need canonicalization (C14N). 
    // Since we don't have a robust C14N lib in JS easily, we rely on the SDK for the final hash.
    // This function is kept for basic pre-checks or non-signed hashing.
    return crypto.createHash('sha256').update(xmlContent).digest('base64');
};

export const signInvoiceXML = async (xmlContent: string, certificate: string, privateKey: string) => {
    try {
        console.log("Signing Invoice via SDK...");
        const result = await signInvoiceSDK(xmlContent, certificate, privateKey);
        return {
            signedXml: result.signedXml,
            invoiceHash: result.hash,
            qr: result.qr
        };
    } catch (error) {
        console.error("SDK Signing failed", error);
        throw error;
    }
}

export const createInvoiceXml = generateInvoiceXML;
