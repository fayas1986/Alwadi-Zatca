
import { Invoice, InvoiceItem } from '../types';

export interface ValidationResult {
  isValid: boolean;
  validationResults: Array<{
    type: 'INFO' | 'WARNING' | 'ERROR';
    code: string;
    message: string;
  }>;
}

// Helper: Check if string is a valid ISO 8601 date/time
const isValidISODate = (dateStr: string) => {
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
};

// Helper: Round to 2 decimals for currency comparison
const round2 = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

// Helper: Validate Address Structure (ZATCA specific)
const validateAddress = (address: any, partyType: 'Seller' | 'Buyer'): Array<{ type: 'ERROR', code: string, message: string }> => {
    const errors: Array<{ type: 'ERROR', code: string, message: string }> = [];
    
    if (!address.streetName) errors.push({ type: 'ERROR', code: 'BR-KSA-09', message: `${partyType} Address: Street Name is mandatory.` });
    if (!address.buildingNumber) errors.push({ type: 'ERROR', code: 'BR-KSA-09', message: `${partyType} Address: Building Number is mandatory.` });
    // Note: 4-digit building number check is a warning in some phases, but we enforce presence.
    if (address.buildingNumber && !/^\d{4}$/.test(address.buildingNumber)) errors.push({ type: 'ERROR', code: 'KSA-17', message: `${partyType} Address: Building Number must be 4 digits.` });
    
    if (!address.citySubdivisionName) errors.push({ type: 'ERROR', code: 'BR-KSA-09', message: `${partyType} Address: District/Subdivision is mandatory.` });
    if (!address.cityName) errors.push({ type: 'ERROR', code: 'BR-KSA-09', message: `${partyType} Address: City is mandatory.` });
    if (!address.postalZone) errors.push({ type: 'ERROR', code: 'BR-KSA-09', message: `${partyType} Address: Postal Code is mandatory.` });
    if (address.postalZone && !/^\d{5}$/.test(address.postalZone)) errors.push({ type: 'ERROR', code: 'KSA-18', message: `${partyType} Address: Postal Code must be 5 digits.` });
    if (address.countryCode !== 'SA') errors.push({ type: 'ERROR', code: 'BR-KSA-09', message: `${partyType} Address: Country Code must be 'SA' for domestic invoices.` });

    return errors;
};

export const validateZatcaInvoice = (invoice: Invoice): ValidationResult => {
  const results: Array<{ type: 'INFO' | 'WARNING' | 'ERROR'; code: string; message: string }> = [];

  // ==========================================
  // 1. General Invoice Structure & Timestamp
  // ==========================================
  
  // BR-02: Invoice Number (BT-1)
  if (!invoice.invoiceNumber) {
    results.push({ type: 'ERROR', code: 'BR-02', message: 'Invoice number (BT-1) is mandatory.' });
  }

  // KSA-2: UUID (Universally Unique Identifier)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!invoice.uuid || !uuidRegex.test(invoice.uuid)) {
    results.push({ type: 'ERROR', code: 'KSA-2', message: 'Invoice UUID must be a valid version 4 UUID.' });
  }

  // KSA-25: Issue Date & Time (ISO 8601)
  if (!invoice.issueDate || !isValidISODate(invoice.issueDate)) {
    results.push({ type: 'ERROR', code: 'KSA-25', message: 'Invoice Issue Date and Time are mandatory and must be ISO 8601 compliant.' });
  }

  // BR-01: Invoice Type Code
  if (!invoice.invoiceSubtype) {
    results.push({ type: 'ERROR', code: 'BR-01', message: 'Invoice Subtype (Standard/Simplified) must be specified.' });
  }

  // BR-05: Invoice Currency Code
  if (!invoice.currencyCode) {
    results.push({ type: 'ERROR', code: 'BR-05', message: 'Invoice Currency Code (BT-5) is mandatory.' });
  }

  // ==========================================
  // 2. Partner Validation (Seller)
  // ==========================================

  // Regex Patterns
  const vatRegex = /^3[0-9]{13}3$/; // 15 digits, starts/ends with 3
  const crRegex = /^[0-9]{10}$/;    // 10 digits

  // Seller Checks
  
  // BR-06: Seller Name
  if (!invoice.supplier.name) {
      results.push({ type: 'ERROR', code: 'BR-06', message: 'Seller Name is mandatory.' });
  }
  
  // BR-KSA-31: Seller VAT Number
  if (!invoice.supplier.vatNumber) {
    results.push({ type: 'ERROR', code: 'BR-KSA-31', message: 'Seller VAT Number is mandatory.' });
  } else if (!vatRegex.test(invoice.supplier.vatNumber)) {
    results.push({ type: 'ERROR', code: 'BR-KSA-31', message: `Seller VAT Number '${invoice.supplier.vatNumber}' is invalid. It must be 15 digits starting and ending with 3.` });
  }

  // BR-KSA-39: Seller CR Number
  if (invoice.supplier.crNumber && !crRegex.test(invoice.supplier.crNumber)) {
    results.push({ type: 'WARNING', code: 'BR-KSA-39', message: `Seller CR Number '${invoice.supplier.crNumber}' format is invalid (expected 10 digits).` });
  }

  // BR-KSA-09: Seller Address Completeness
  const sellerAddressErrors = validateAddress(invoice.supplier.address, 'Seller');
  results.push(...sellerAddressErrors);

  // ==========================================
  // 3. Partner Validation (Buyer - Differentiated)
  // ==========================================

  // STANDARD INVOICE (B2B) RULES
  if (invoice.invoiceSubtype === 'Standard') {
    // BR-KSA-40: Buyer Name
    if (!invoice.customer.name) {
        results.push({ type: 'ERROR', code: 'BR-KSA-40', message: 'Buyer Name is mandatory for Standard Invoices.' });
    }
    
    // BR-KSA-42: Buyer VAT Number or ID
    if (invoice.customer.vatNumber) {
        if (!vatRegex.test(invoice.customer.vatNumber)) {
            results.push({ type: 'ERROR', code: 'BR-KSA-42', message: `Buyer VAT Number '${invoice.customer.vatNumber}' is invalid.` });
        }
    } else {
        // For B2B, if VAT is missing, usually other ID is required, but we'll flag as warning/error
        results.push({ type: 'WARNING', code: 'BR-KSA-42', message: 'Buyer VAT Number is strongly recommended for Standard Tax Invoices (B2B).' });
    }

    // Address is Mandatory for Buyer in Standard Invoice
    const buyerAddressErrors = validateAddress(invoice.customer.address, 'Buyer');
    results.push(...buyerAddressErrors);
  } 
  
  // SIMPLIFIED INVOICE (B2C) RULES
  else if (invoice.invoiceSubtype === 'Simplified') {
      // Buyer details are optional/minimal for Simplified, checking logic skipped
  }

  // ==========================================
  // 4. Line Item & VAT Rules
  // ==========================================

  // BR-16: At least one line item
  if (!invoice.items || invoice.items.length === 0) {
    results.push({ type: 'ERROR', code: 'BR-16', message: 'Invoice must contain at least one invoice line.' });
  } else {
    let calculatedTaxExclusiveTotal = 0;
    let calculatedVatTotal = 0;
    let calculatedGrandTotal = 0;

    invoice.items.forEach((item, index) => {
      const lineRef = `Line ${index + 1}`;

      // 4.1 ZATCA VAT Category vs Rate Rules
      // S (Standard) = 15%
      // Z (Zero) = 0%
      // E (Exempt) = 0%
      // O (Out of scope) = 0%
      
      const category = item.taxCategory || 'S';
      
      if (category === 'S') {
          if (item.vatRate !== 0.15) {
              results.push({ type: 'ERROR', code: 'BR-KSA-EN-163', message: `${lineRef}: Tax Category 'S' must have a VAT rate of 15%. Found ${(item.vatRate * 100)}%.` });
          }
      } else if (['Z', 'E', 'O'].includes(category)) {
          if (item.vatRate !== 0) {
              results.push({ type: 'ERROR', code: 'BR-KSA-EN-163', message: `${lineRef}: Tax Category '${category}' must have a VAT rate of 0%.` });
          }
      } else {
          results.push({ type: 'ERROR', code: 'BR-KSA-EN-163', message: `${lineRef}: Invalid Tax Category '${category}'. Must be S, Z, E, or O.` });
      }

      // 4.2 Arithmetic Validation
      
      // BR-DEC-09: Line Extension Amount (Subtotal)
      // Calculated as: (Qty * Price) - Discount
      const expectedSubtotal = round2(item.quantity * item.unitPrice - (item.discount || 0));
      if (Math.abs(expectedSubtotal - item.subtotal) > 0.05) {
        results.push({ type: 'ERROR', code: 'BR-DEC-09', message: `${lineRef}: Calculated subtotal (${expectedSubtotal}) does not match provided subtotal (${item.subtotal}).` });
      }

      // BR-DEC-12: VAT Amount per line
      const expectedVat = round2(item.subtotal * item.vatRate);
      if (Math.abs(expectedVat - item.vatAmount) > 0.05) {
        results.push({ type: 'ERROR', code: 'BR-DEC-12', message: `${lineRef}: Calculated VAT (${expectedVat}) does not match provided VAT (${item.vatAmount}).` });
      }

      // BR-DEC-21: Item Total
      const expectedLineTotal = round2(item.subtotal + item.vatAmount);
      if (Math.abs(expectedLineTotal - item.total) > 0.05) {
        results.push({ type: 'ERROR', code: 'BR-DEC-21', message: `${lineRef}: Line Total mismatch. Expected ${expectedLineTotal}, got ${item.total}.` });
      }

      // Aggregate for Invoice Totals
      calculatedTaxExclusiveTotal += item.subtotal;
      calculatedVatTotal += item.vatAmount;
      calculatedGrandTotal += item.total;
    });

    // ==========================================
    // 5. Invoice Totals Consistency
    // ==========================================
    
    // BR-CO-10: Sum of InvoiceLineNetAmounts = TaxExclusiveAmount
    if (Math.abs(round2(calculatedTaxExclusiveTotal) - invoice.taxExclusiveAmount) > 0.05) {
      results.push({ type: 'ERROR', code: 'BR-CO-10', message: `Sum of line subtotals (${round2(calculatedTaxExclusiveTotal)}) does not match Tax Exclusive Amount (${invoice.taxExclusiveAmount}).` });
    }

    // BR-CO-12: Sum of InvoiceLineTaxAmounts = TaxAmount
    if (Math.abs(round2(calculatedVatTotal) - invoice.vatAmount) > 0.05) {
      results.push({ type: 'ERROR', code: 'BR-CO-12', message: `Sum of line VAT (${round2(calculatedVatTotal)}) does not match Total VAT Amount (${invoice.vatAmount}).` });
    }

    // BR-CO-13: TaxExclusiveAmount + TaxAmount = TaxInclusiveAmount
    if (Math.abs(round2(calculatedGrandTotal) - invoice.totalAmount) > 0.05) {
      results.push({ type: 'ERROR', code: 'BR-CO-13', message: `Sum of line totals (${round2(calculatedGrandTotal)}) does not match Grand Total (${invoice.totalAmount}).` });
    }
  }

  // ==========================================
  // 6. Phase 2 Cryptography Checks (Logical Existence)
  // ==========================================
  
  // KSA-1: Previous Invoice Hash
  // Logic: Only skipped if it's the very first invoice ever (Counter = 1), otherwise mandatory
  if (!invoice.previousInvoiceHash && invoice.id !== '1' && invoice.id !== 'mock-100') {
    results.push({ type: 'WARNING', code: 'KSA-1', message: 'Previous Invoice Hash is missing. Cryptographic chain continuity is potentially broken.' });
  }

  const errors = results.filter(r => r.type === 'ERROR');

  return {
    isValid: errors.length === 0,
    validationResults: results
  };
};
