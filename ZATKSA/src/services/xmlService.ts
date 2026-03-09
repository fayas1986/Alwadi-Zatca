
import { create } from 'xmlbuilder2';
import crypto from 'crypto';
import { signInvoice as signInvoiceSDK } from './sdkService';

export interface InvoiceItem {
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
}

export interface InvoiceData {
    invoiceNumber: string;
    issueDate: string;
    invoiceSubtype: 'Standard' | 'Simplified';
    currencyCode?: string;
    taxExclusiveAmount: number;
    totalAmount: number;
    supplier: {
        vatNumber: string;
    };
    items: InvoiceItem[];
    previousInvoiceHash?: string;
}

export const generateInvoiceXML = (invoice: InvoiceData) => {
    const uuid = crypto.randomUUID();
    // Basic UBL 2.1 mapping
    const xml = create({ version: '1.0', encoding: 'UTF-8' })
        .ele('Invoice', {
            'xmlns': 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
            'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
            'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'
        })
        .ele('cbc:ProfileID').txt('reporting:1.0').up()
        .ele('cbc:ID').txt(invoice.invoiceNumber).up()
        .ele('cbc:UUID').txt(uuid).up()
        .ele('cbc:IssueDate').txt(invoice.issueDate.split('T')[0]).up()
        .ele('cbc:IssueTime').txt(invoice.issueDate.split('T')[1].split('.')[0]).up()
        .ele('cbc:InvoiceTypeCode', { name: '0111' }).txt('388').up()
        .ele('cbc:Note').txt('This is a computer generated invoice').up()
        .ele('cbc:DocumentCurrencyCode').txt(invoice.currencyCode || 'SAR').up()
        .ele('cbc:TaxCurrencyCode').txt('SAR').up()
        // ... (remaining identical)
        .ele('cac:AdditionalDocumentReference')
        .ele('cbc:ID').txt('PIH').up()
        .ele('cac:Attachment')
        .ele('cbc:EmbeddedDocumentBinaryObject', { mimeCode: 'text/plain' })
        .txt(invoice.previousInvoiceHash || 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMjRiZmQ3NTI0MjkzZjBlYTRiM2IzZTk4MTU1MWNiMA==')
        .up()
        .up()
        .up()

        // Supplier
        .ele('cac:AccountingSupplierParty')
        .ele('cac:Party')
        .ele('cac:PartyTaxScheme')
        .ele('cbc:CompanyID').txt(invoice.supplier.vatNumber).up()
        .ele('cac:TaxScheme')
        .ele('cbc:ID').txt('VAT').up()
        .up()
        .up()
        .up()
        .up()

        // Totals
        .ele('cac:LegalMonetaryTotal')
        .ele('cbc:LineExtensionAmount', { currencyID: 'SAR' }).txt(invoice.taxExclusiveAmount.toFixed(2)).up()
        .ele('cbc:TaxExclusiveAmount', { currencyID: 'SAR' }).txt(invoice.taxExclusiveAmount.toFixed(2)).up()
        .ele('cbc:TaxInclusiveAmount', { currencyID: 'SAR' }).txt(invoice.totalAmount.toFixed(2)).up()
        .ele('cbc:PayableAmount', { currencyID: 'SAR' }).txt(invoice.totalAmount.toFixed(2)).up()
        .up();

    // Map items...
    invoice.items.forEach((item, index) => {
        xml.ele('cac:InvoiceLine')
            .ele('cbc:ID').txt((index + 1).toString()).up()
            .ele('cbc:InvoicedQuantity', { unitCode: 'PCE' }).txt(item.quantity.toString()).up()
            .ele('cbc:LineExtensionAmount', { currencyID: 'SAR' }).txt(item.subtotal.toFixed(2)).up()
            .ele('cac:Item')
            .ele('cbc:Name').txt(item.name).up()
            .up()
            .ele('cac:Price')
            .ele('cbc:PriceAmount', { currencyID: 'SAR' }).txt(item.unitPrice.toFixed(2)).up()
            .up()
            .up();
    });

    return { xml: xml.end({ prettyPrint: true }), uuid };
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
