
import { create } from 'xmlbuilder2';
import { appendFileSync } from 'fs';
import { Invoice } from '../types.js';
import crypto from 'crypto';
import { signInvoice as signInvoiceSDK } from './sdkService.js';

const safeNum = (v: any) => Number(v) || 0;

export const generateInvoiceXML = (invoice: Invoice) => {
    // Robust calculation for Totals
    let calcTax = 0;
    let calcTotal = 0;
    let calcExclusive = 0;

    if (Array.isArray(invoice.items)) {
        invoice.items.forEach(it => {
            const sub = safeNum(it.subtotal || (safeNum(it.quantity) * safeNum(it.unitPrice)));
            const rate = safeNum(it.vatRate || 0.15);
            const lineTax = safeNum(it.taxAmount || (sub * rate));
            calcTax += lineTax;
            calcExclusive += sub;
            calcTotal += (sub + lineTax);
        });
    }

    const totalAmount = (safeNum(invoice.totalAmount) || calcTotal).toFixed(2);
    const taxAmount = (safeNum((invoice as any).taxAmount || invoice.vatAmount) || calcTax).toFixed(2);
    const taxExclusiveAmount = (safeNum(invoice.taxExclusiveAmount || (invoice.totalAmount - (invoice.vatAmount || 0))) || calcExclusive).toFixed(2);

    const rawIssueDate = (invoice as any).issueDate || new Date().toISOString();
    const issueDate = String(rawIssueDate);
    const datePart = issueDate.includes('T') ? issueDate.split('T')[0] : issueDate.split(' ')[0];
    const timePart = issueDate.includes('T') 
        ? issueDate.split('T')[1].split('.')[0].split('+')[0].split('Z')[0] 
        : (issueDate.includes(' ') ? issueDate.split(' ')[1].split('.')[0] : '00:00:00');

    try {
        const xml = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('Invoice', {
                'xmlns': 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
                'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
                'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'
            })
            .ele('cbc:ProfileID').txt('reporting:1.0').up()
            .ele('cbc:ID').txt(invoice.invoiceNumber || 'SIM-' + Date.now()).up()
            .ele('cbc:UUID').txt(crypto.randomUUID()).up()
            .ele('cbc:IssueDate').txt(datePart).up()
            .ele('cbc:IssueTime').txt(timePart).up();

        // Map Document Type to ZATCA InvoiceTypeCode
        // 388 = Invoice, 381 = Credit Note, 383 = Debit Note
        let typeCode = '388';
        if (invoice.documentType === 'Credit Note') typeCode = '381';
        else if (invoice.documentType === 'Debit Note') typeCode = '383';

        // Subtype (Simplified vs Standard)
        const subtypeCode = invoice.invoiceSubtype === 'Standard' ? '0100000' : '0200000';

        xml.ele('cbc:InvoiceTypeCode', { name: subtypeCode }).txt(typeCode).up()
            .ele('cbc:Note').txt(invoice.instructionNote || 'This is a computer generated invoice').up()
            .ele('cbc:DocumentCurrencyCode').txt(invoice.currencyCode || 'SAR').up()
            .ele('cbc:TaxCurrencyCode').txt('SAR').up()

            // Previous Invoice Hash (PIH)
            .ele('cac:AdditionalDocumentReference')
            .ele('cbc:ID').txt('PIH').up()
            .ele('cac:Attachment')
            .ele('cbc:EmbeddedDocumentBinaryObject', { mimeCode: 'text/plain' })
            .txt(invoice.previousInvoiceHash || 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMjRiZmQ3NTI0MjkzZjBlYTRiM2IzZTk4MTU1MWNiMA==')
            .up()
            .up();

        // Billing Reference (Mandatory for Credit/Debit Notes)
        if (invoice.billingReference) {
            xml.ele('cac:BillingReference')
                .ele('cac:InvoiceDocumentReference')
                .ele('cbc:ID').txt(invoice.billingReference).up()
                .up()
                .up();
        }

        // Supplier
        xml.ele('cac:AccountingSupplierParty')
            .ele('cac:Party')
            .ele('cac:PartyIdentification')
            .ele('cbc:ID', { schemeID: 'CRN' }).txt('1010010000').up() // Should be dynamic
            .up()
            .ele('cac:PostalAddress')
            .ele('cbc:StreetName').txt(invoice.supplier?.address?.streetName || 'Unknown').up()
            .ele('cbc:BuildingNumber').txt(invoice.supplier?.address?.buildingNumber || '0000').up()
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
            .ele('cbc:RegistrationName').txt(invoice.supplier?.name || 'Tech Solutions Ltd').up()
            .up()
            .up()
            .up()

            // Customer
            .ele('cac:AccountingCustomerParty')
            .ele('cac:Party')
            .ele('cac:PostalAddress')
            .ele('cbc:StreetName').txt(invoice.customer?.address?.streetName || 'Unknown').up()
            .ele('cbc:BuildingNumber').txt(invoice.customer?.address?.buildingNumber || '0000').up()
            .ele('cbc:CityName').txt(invoice.customer?.address?.cityName || 'Riyadh').up()
            .ele('cbc:PostalZone').txt(invoice.customer?.address?.postalZone || '12345').up()
            .ele('cac:Country')
            .ele('cbc:IdentificationCode').txt('SA').up()
            .up()
            .up()
            .ele('cac:PartyTaxScheme')
            .ele('cbc:CompanyID').txt(invoice.customer?.vatNumber || '300000000000003').up() // Default for simplified if unknown
            .ele('cac:TaxScheme')
            .ele('cbc:ID').txt('VAT').up()
            .up()
            .up()
            .ele('cac:PartyLegalEntity')
            .ele('cbc:RegistrationName').txt(invoice.customer?.name || 'Cash Client').up()
            .up()
            .up()
            .up()

            // Tax Total
            .ele('cac:TaxTotal')
            .ele('cbc:TaxAmount', { currencyID: 'SAR' }).txt(taxAmount).up()
            .ele('cac:TaxSubtotal')
            .ele('cbc:TaxableAmount', { currencyID: 'SAR' }).txt(taxExclusiveAmount).up()
            .ele('cbc:TaxAmount', { currencyID: 'SAR' }).txt(taxAmount).up()
            .ele('cac:TaxCategory')
            .ele('cbc:ID').txt(invoice.taxCategory || 'S').up() // Shared category
            .ele('cbc:Percent').txt(safeNum(taxAmount) > 0 ? (safeNum(invoice.vatRate) * 100 || 15).toFixed(2) : '0.00').up()
            .ele('cac:TaxScheme')
            .ele('cbc:ID').txt('VAT').up()
            .up()
            .up()
            .up()
            .up()

            // Totals
            .ele('cac:LegalMonetaryTotal')
            .ele('cbc:LineExtensionAmount', { currencyID: 'SAR' }).txt(taxExclusiveAmount).up()
            .ele('cbc:TaxExclusiveAmount', { currencyID: 'SAR' }).txt(taxExclusiveAmount).up()
            .ele('cbc:TaxInclusiveAmount', { currencyID: 'SAR' }).txt(totalAmount).up()
            .ele('cbc:PayableAmount', { currencyID: 'SAR' }).txt(totalAmount).up()
            .up();

        // Map items...
        if (Array.isArray(invoice.items)) {
            invoice.items.forEach((item, index) => {
                const vatRateRaw = safeNum(item.vatRate) || 0.15;
                const vatRatePercent = (vatRateRaw < 1) ? (vatRateRaw * 100) : vatRateRaw;
                const subtotal = safeNum(item.subtotal) || (safeNum(item.quantity) * safeNum(item.unitPrice));
                const lineExtensionAmount = subtotal.toFixed(2);
                const itemTaxAmount = (subtotal * (vatRatePercent / 100)).toFixed(2);

                xml.ele('cac:InvoiceLine')
                    .ele('cbc:ID').txt((index + 1).toString()).up()
                    .ele('cbc:InvoicedQuantity', { unitCode: 'PCE' }).txt(safeNum(item.quantity).toString()).up()
                    .ele('cbc:LineExtensionAmount', { currencyID: 'SAR' }).txt(lineExtensionAmount).up()
                    
                    .ele('cac:TaxTotal')
                        .ele('cbc:TaxAmount', { currencyID: 'SAR' }).txt(itemTaxAmount).up()
                        .ele('cac:TaxSubtotal')
                            .ele('cbc:TaxableAmount', { currencyID: 'SAR' }).txt(lineExtensionAmount).up()
                            .ele('cbc:TaxAmount', { currencyID: 'SAR' }).txt(itemTaxAmount).up()
                            .ele('cac:TaxCategory')
                                .ele('cbc:ID').txt(item.taxCategory || 'S').up()
                                .ele('cbc:Percent').txt(vatRatePercent.toFixed(2)).up()
                                .ele('cac:TaxScheme')
                                    .ele('cbc:ID').txt('VAT').up()
                                .up() // Close TaxScheme
                            .up() // Close TaxCategory
                        .up() // Close TaxSubtotal
                    .up() // Close TaxTotal

                    .ele('cac:Item')
                        .ele('cbc:Name').txt(item.name || 'Item').up()
                        .ele('cbc:Description').txt(item.nameAr || item.description || '').up()
                        .ele('cac:ClassifiedTaxCategory')
                            .ele('cbc:ID').txt(item.taxCategory || 'S').up()
                            .ele('cbc:Percent').txt(vatRatePercent.toFixed(2)).up()
                            .ele('cac:TaxScheme')
                                .ele('cbc:ID').txt('VAT').up()
                            .up() // Close TaxScheme
                        .up() // Close ClassifiedTaxCategory
                    .up() // Close Item
                    
                    .ele('cac:Price')
                        .ele('cbc:PriceAmount', { currencyID: 'SAR' }).txt(safeNum(item.unitPrice).toFixed(2)).up()
                    .up() // Close Price
                .up(); // Close InvoiceLine
            });
        }

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
