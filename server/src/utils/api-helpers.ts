
import { Response } from 'express';
import * as crypto from 'crypto';

/**
 * CORE COMPLIANCE HELPERS
 * Mandatory for ZATCA Phase 2 (UUID, Hash, and Chaining)
 */
export const generateUUID = () => crypto.randomUUID();

/**
 * ZATCA strictly requires KSA Timezone (UTC+3)
 */
export const getKSATimestamp = (date?: Date) => {
    const d = date || new Date();
    // Offset for AST (Arabian Standard Time) is UTC+3
    const ksaOffset = 3 * 60 * 60 * 1000;
    const ksaDate = new Date(d.getTime() + ksaOffset);
    return ksaDate.toISOString().replace('Z', '+03:00');
};

export const generateHash = (content: string) => {
    return crypto
        .createHash('sha256')
        .update(content, 'utf8')
        .digest('base64');
};

export const INITIAL_PIH = '0';

/**
 * Handles the core requirement of identity and chain derivation
 */
export async function processInvoiceChaining(payload: any, lastHash: string | null) {
    const uuid = payload.uuid || generateUUID();
    // Preliminary hash for the request payload (if XML isn't generated yet)
    const currentHash = generateHash(JSON.stringify(payload));
    
    return {
        uuid,
        invoiceHash: currentHash,
        previousHash: lastHash || INITIAL_PIH // Default for first invoice
    };
}

export interface ApiErrorDetail {
    field?: string;
    issue: string;
}

export const sendError = (res: Response, status: number, code: string, message: string, details?: ApiErrorDetail[]) => {
    return res.status(status).json({
        status: 'ERROR',
        code,
        message,
        details,
        timestamp: getKSATimestamp()
    });
};

export const sendSuccess = (res: Response, data: any, status = 200) => {
    return res.status(status).json({
        status: 'SUCCESS',
        ...data,
        timestamp: new Date().toISOString()
    });
};

export const sendAccepted = (res: Response, jobId: string, message?: string, extra: any = {}) => {
    return res.status(202).json({
        status: 'ACCEPTED',
        jobId,
        submittedAt: new Date().toISOString(),
        message: message || 'Request accepted for background processing',
        ...extra
    });
};

/**
 * Calculates correct totals from items if not provided or zero
 */
export const calculateInvoiceTotals = (payload: any) => {
    // 1. Standardize case sensitivity
    if (payload.invoiceSubtype) {
        payload.invoiceSubtype = payload.invoiceSubtype.toUpperCase();
    }

    // 2. Normalize Credit/Debit Note context and Standardize Document Type
    if (payload.documentType) {
        payload.documentType = payload.documentType.toUpperCase().replace(/\s+/g, '_');
    }
    const isNote = payload.documentType === 'CREDIT_NOTE' || payload.documentType === 'DEBIT_NOTE';
    
    if (!payload.items || !Array.isArray(payload.items)) return payload;
    
    // Use integer math (halala) for internal calculations
    const toHalala = (n: number) => Math.round((n + Number.EPSILON) * 100);
    const fromHalala = (n: number) => n / 100;

    let totalTaxHalala = 0;
    let totalTaxExclusiveHalala = 0;
    
    const items = payload.items.map((item: any) => {
        const qty = isNote ? Math.abs(Number(item.quantity || 1)) : Number(item.quantity || 1);
        const price = isNote ? Math.abs(Number(item.unitPrice || 0)) : Number(item.unitPrice || 0);
        
        // Handle allowances/charges at line level (normalize discount and allowanceAmount)
        const allowance = Number(item.allowanceAmount !== undefined ? item.allowanceAmount : (item.discount || 0));
        const charge = Number(item.chargeAmount || 0);
        
        const grossHalala = toHalala(qty * price);
        const allowanceHalala = toHalala(allowance);
        const chargeHalala = toHalala(charge);

        // Line Extension Amount = (Quantity * UnitPrice) - Allowance + Charge
        const lineNetHalala = grossHalala - allowanceHalala + chargeHalala;

        // Use vatRate as a percentage (e.g. 15) or fraction (e.g. 0.15) — normalize first
        let vatRate = Number(item.vatRate ?? 0.15);
        const ratePercent = vatRate < 1 ? vatRate * 100 : vatRate;

        // VAT per line (rounded to 2 decimals as per ZATCA BR-KSA-XX)
        const taxHalala = Math.round((lineNetHalala * ratePercent) / 100);
                
        totalTaxHalala += taxHalala;
        totalTaxExclusiveHalala += lineNetHalala;

        return {
            ...item,
            quantity: qty,
            unitPrice: Number(price.toFixed(2)),
            discount: allowance,
            allowanceAmount: allowance,
            subtotal: fromHalala(lineNetHalala),
            lineTotal: fromHalala(lineNetHalala),
            taxAmount: fromHalala(taxHalala),
            vatAmount: fromHalala(taxHalala),
            total: fromHalala(lineNetHalala + taxHalala),
            totalWithVat: fromHalala(lineNetHalala + taxHalala)
        };
    });

    const totalTaxInclusiveHalala = totalTaxExclusiveHalala + totalTaxHalala;

    // Enforce perfect math for ZATCA (overwrite header totals with exact sum of lines)
    const updated = { ...payload, items };
    updated.vatAmount = fromHalala(totalTaxHalala);
    updated.lineExtensionAmount = fromHalala(totalTaxExclusiveHalala);
    updated.taxExclusiveAmount = fromHalala(totalTaxExclusiveHalala);
    updated.taxInclusiveAmount = fromHalala(totalTaxInclusiveHalala);
    updated.totalAmount = fromHalala(totalTaxInclusiveHalala);
    updated.totalAmount = updated.taxInclusiveAmount;
    
    // ZATCA Full Breakdown Support
    updated.allowanceTotalAmount = Number((payload.allowanceTotalAmount || 0).toFixed(2));
    updated.chargeTotalAmount = Number((payload.chargeTotalAmount || 0).toFixed(2));
    updated.prepaidAmount = Number((payload.prepaidAmount || 0).toFixed(2));
    
    // PayableAmount = TaxInclusiveAmount - PrepaidAmount + ChargeTotalAmount - AllowanceTotalAmount
    const payableHalala = totalTaxInclusiveHalala - toHalala(updated.prepaidAmount) + toHalala(updated.chargeTotalAmount) - toHalala(updated.allowanceTotalAmount);
    updated.payableAmount = fromHalala(payableHalala);
    
    // Ensure currency is set
    updated.currencyCode = payload.currencyCode || payload.currency || 'SAR';
    updated.currency = updated.currencyCode;
    
    return updated;
};

/**
 * Automates compliance field injection for ZATCA standard/simplified invoices
 */
export const injectComplianceFields = (payload: any, type: string) => {
    // First, ensure totals are calculated if missing
    let injected = calculateInvoiceTotals(payload);
    
    // 1. UUID Generation (ZATCA Mandatory)
    if (!injected.uuid) injected.uuid = generateUUID();
    
    // 2. Persistence: Store Document Type (Standardized)
    injected.documentType = (type || payload.documentType || 'INVOICE').toUpperCase().replace(/\s+/g, '_');

    // 3. Invoice Type Code (ZATCA standards)
    // 388 = Invoice, 381 = Credit Note, 383 = Debit Note
    const docType = injected.documentType;
    let ublCode = '388';
    if (docType === 'CREDIT_NOTE') ublCode = '381';
    else if (docType === 'DEBIT_NOTE') ublCode = '383';
    injected.ublTypeCode = ublCode;

    // Subtype Code (0100000 = Standard, 0200000 = Simplified)
    const hasCustomerVat = !!(injected.customer?.vatNumber);
    injected.invoiceSubtype = (payload.invoiceSubtype || (hasCustomerVat ? 'STANDARD' : 'SIMPLIFIED')).toUpperCase();
    
    if (!injected.invoiceTypeCode) {
        injected.invoiceTypeCode = (injected.invoiceSubtype === 'STANDARD') ? '0100000' : '0200000';
    }
    
    // 4. Currency Alignment (Mandatory: SAR)
    if (injected.currency) {
        injected.currencyCode = injected.currency;
    }
    if (!injected.currencyCode || injected.currencyCode !== 'SAR') {
        injected.currencyCode = 'SAR';
        injected.currency = 'SAR';
    } else if (!injected.currency) {
        injected.currency = injected.currencyCode;
    }

    // 5. Billing Reference & Reason Normalization (Mandatory for Credit/Debit Notes)
    if (payload.originalInvoice) {
        injected.billingReference = {
            id: payload.originalInvoice.id || payload.originalInvoice.uuid,
            uuid: payload.originalInvoice.uuid,
            issueDate: payload.originalInvoice.issueDate || new Date().toISOString().split('T')[0]
        };
    } else if (injected.billingReference && typeof injected.billingReference === 'string') {
        injected.billingReference = {
            id: injected.billingReference,
            issueDate: new Date().toISOString().split('T')[0] // Fallback
        };
    }

    if (payload.reason) {
        injected.instructionNote = payload.reason.description || payload.reason.text || injected.instructionNote;
    }

    // 6. Ensure Issue Date has real processing time if missing or midnight (00:00:00)
    let rawDate = injected.issueDate || new Date().toISOString();
    let hasMidnight = false;

    if (typeof rawDate === 'string') {
        if (rawDate.length <= 10 || rawDate.includes('00:00:00')) {
            hasMidnight = true;
        }
    } else if (rawDate instanceof Date) {
        if (rawDate.getUTCHours() === 0 && rawDate.getUTCMinutes() === 0 && rawDate.getUTCSeconds() === 0) {
            hasMidnight = true;
        }
    }

    if (hasMidnight) {
        const dateOnly = (typeof rawDate === 'string' ? rawDate.split('T')[0].split(' ')[0] : rawDate.toISOString().split('T')[0]);
        const realTime = new Date().toISOString().split('T')[1];
        injected.issueDate = `${dateOnly}T${realTime}`;
    }

    // 7. Standardize Customer Address & Extract Building Number / District
    if (injected.customer) {
        const topAddr = payload.address;
        const custAddr = injected.customer.address || payload.customer?.address || topAddr;

        let street = '';
        let building = '';
        let city = injected.customer.city || '';
        let postal = '';
        let country = 'SA';
        let district = '';

        if (typeof custAddr === 'string') {
            street = custAddr;
        } else if (custAddr) {
            street = custAddr.streetName || custAddr.street_name || custAddr.street || '';
            building = custAddr.buildingNumber || custAddr.building_number || custAddr.building || '';
            city = custAddr.cityName || custAddr.city_name || custAddr.city || city;
            postal = custAddr.postalZone || custAddr.postal_zone || custAddr.zip || custAddr.postcode || '';
            country = custAddr.countryCode || custAddr.country_code || custAddr.country || 'SA';
            district = custAddr.citySubdivisionName || custAddr.city_subdivision_name || custAddr.district || '';
        }

        if (topAddr && typeof topAddr === 'object') {
            const topStreet = topAddr.streetName || topAddr.street_name || topAddr.street || '';
            const topBuilding = topAddr.buildingNumber || topAddr.building_number || topAddr.building || '';
            
            if (topStreet && !street.includes(topStreet)) {
                street = street ? `${street} ${topStreet}` : topStreet;
            }
            if ((!building || building === '0000') && topBuilding) building = topBuilding;
            if (!city && topAddr.cityName) city = topAddr.cityName;
            if (!postal && topAddr.postalZone) postal = topAddr.postalZone;
            if (!district && topAddr.citySubdivisionName) district = topAddr.citySubdivisionName;
        }

        city = city || 'Riyadh';
        district = district || city;

        if (!building || building === '0000' || building === '0') {
            const explicitMatch = street.match(/(?:building|bldg|no|#|رقم\s*المبنى)[\s.:#]*(\d{4,5})/i);
            if (explicitMatch) {
                building = explicitMatch[1];
            } else {
                const numMatch = street.match(/\b(\d{4,5})\b/);
                if (numMatch) {
                    building = numMatch[1];
                }
            }
        }

        if (!building || building === '0') building = '0000';
        if (building.length > 4 && building !== '0000') building = building.substring(0, 4);

        injected.customer.address = {
            streetName: street || 'Main Street',
            buildingNumber: building,
            cityName: city,
            citySubdivisionName: district,
            postalZone: postal || '00000',
            countryCode: country === 'SAU' ? 'SA' : (country || 'SA')
        };
    }
    
    return injected;
};

/**
 * CRITICAL COMPLIANCE VALIDATOR
 * Prevents common ZATCA production failures
 */
export const validateHardenedCompliance = (invoice: any) => {
    const errors: ApiErrorDetail[] = [];

    // 1. Mandatory Header Fields
    if (!invoice.invoiceNumber) errors.push({ field: 'invoiceNumber', issue: 'Missing mandatory invoice number' });
    if (!invoice.issueDate) errors.push({ field: 'issueDate', issue: 'Missing issue date' });
    
    // 2. Monetary Precision (Enforce strictly 2 decimal places for ZATCA)
    const validatePrecision = (val: any, field: string) => {
        if (val !== undefined) {
            const str = val.toString();
            if (str.includes('.') && str.split('.')[1].length > 2) {
                errors.push({ field, issue: 'ZATCA only allows up to 2 decimal places for monetary fields' });
            }
        }
    };

    validatePrecision(invoice.totalAmount, 'totalAmount');
    validatePrecision(invoice.vatAmount, 'vatAmount');

    // 3. Customer Requirements for STANDARD (B2B) Invoices
    if (invoice.invoiceSubtype === 'STANDARD') {
        if (!invoice.customer) {
            errors.push({ field: 'customer', issue: 'Customer details are mandatory for STANDARD invoices' });
        } else {
            if (!invoice.customer.name) errors.push({ field: 'customer.name', issue: 'Customer name is mandatory for STANDARD invoices' });
            if (!invoice.customer.vatNumber) errors.push({ field: 'customer.vatNumber', issue: 'Customer VAT number is mandatory for STANDARD invoices' });
            
            // Standard invoices require specific address fields for ZATCA
            if (!invoice.customer.address) {
                errors.push({ field: 'customer.address', issue: 'Customer address is mandatory for STANDARD invoices' });
            }
        }
    }

    // 4. Reference Requirements for Credit/Debit Notes
    const isNote = ['CREDIT_NOTE', 'DEBIT_NOTE'].includes(invoice.documentType);
    if (isNote && !invoice.billingReference) {
        errors.push({ field: 'billingReference', issue: 'Billing reference (Original Invoice ID) is mandatory for Credit/Debit notes' });
    }

    // 5. Item Integrity
    if (!Array.isArray(invoice.items) || invoice.items.length === 0) {
        errors.push({ field: 'items', issue: 'At least one line item is required' });
    } else {
        // 6. BULLETPROOF MATHEMATICAL INTEGRITY (ZATCA v3.3.4 Standards)
        const DECIMALS = 2;
        const toHalala = (n: number) => Math.round((n + Number.EPSILON) * 100);
        const fromHalala = (n: number) => n / 100;
        const TOLERANCE_HALALA = 1; // 1 halala
        
        let totalExclusiveHalala = 0;
        let totalVatHalala = 0;
        
        // Category grouping (ZATCA requirement for TaxSubtotal section)
        const categoryGroups: Record<string, { net: number, vat: number, rate: number }> = {};

        const isCreditNote = invoice.documentType === 'CREDIT_NOTE';

        invoice.items.forEach((item: any, idx: number) => {
            const quantity = Number(item.quantity || 0);
            const unitPrice = Number(item.unitPrice || 0);
            const discount = Number(item.discount || 0);
            let taxRate = Number(item.taxRate ?? item.vatRate ?? 15);
            // Normalize: If user sent 0.15 (fraction), convert to 15 (percentage)
            if (taxRate > 0 && taxRate < 1) taxRate = taxRate * 100;
            
            const taxCategory = item.taxCategoryCode || item.taxCategory || 'S';
            
            // a. Discount Guard (Check signs consistency for Credit Notes)
            // If Credit Note uses positive values with reversal logic, keep them positive here for the math check
            const grossHalala = toHalala(quantity * unitPrice);
            const discountHalala = toHalala(discount);

            if (Math.abs(discountHalala) > Math.abs(grossHalala)) {
                errors.push({ field: `items[${idx}].discount`, issue: 'Discount exceeds line value' });
            }

            // b. Line Calculation (Serial rounding per ZATCA BR-KSA-XX)
            const lineNetHalala = grossHalala - discountHalala;
            const lineVatHalala = Math.round((lineNetHalala * taxRate) / 100);
            
            totalExclusiveHalala += lineNetHalala;
            totalVatHalala += lineVatHalala;

            // Grouping for TaxTotal/TaxSubtotal validation
            const key = `${taxCategory}_${taxRate}`;
            if (!categoryGroups[key]) {
                categoryGroups[key] = { net: 0, vat: 0, rate: taxRate };
            }
            categoryGroups[key].net += lineNetHalala;
            categoryGroups[key].vat += lineVatHalala;

            // c. Per-line VAT Enforcement
            if (item.itemVatAmount !== undefined) {
                const itemVatHalala = toHalala(Number(item.itemVatAmount));
                if (Math.abs(itemVatHalala - lineVatHalala) > TOLERANCE_HALALA) {
                    errors.push({ 
                        field: `items[${idx}].itemVatAmount`, 
                        issue: `Incorrect VAT calculation. Expected: ${fromHalala(lineVatHalala).toFixed(DECIMALS)}, Found: ${item.itemVatAmount}` 
                    });
                }
            }

            // d. Tax Category Consistency
            if (taxRate === 0 && taxCategory === 'S') {
                errors.push({ field: `items[${idx}].taxCategoryCode`, issue: 'Standard Category (S) cannot have a 0% tax rate' });
            }
        });

        // e. Header Validation (Explicit Amounts & Payable Consistency)
        const totalInclusiveHalala = totalExclusiveHalala + totalVatHalala;
        
        const validateHeaderHalala = (actual: any, expectedHalala: number, field: string) => {
            if (actual !== undefined) {
                const actualHalala = toHalala(Number(actual));
                if (Math.abs(actualHalala - expectedHalala) > TOLERANCE_HALALA) {
                    errors.push({ 
                        field, 
                        issue: `Header ${field} (${actual}) mismatch with sum of lines (${fromHalala(expectedHalala).toFixed(DECIMALS)})` 
                    });
                }
            }
        };
        
        // ZATCA Strict Reconcilation: TaxInclusive = TaxExclusive + TaxAmount
        validateHeaderHalala(invoice.taxExclusiveAmount, totalExclusiveHalala, 'taxExclusiveAmount');
        validateHeaderHalala(invoice.taxInclusiveAmount, totalInclusiveHalala, 'taxInclusiveAmount');
        validateHeaderHalala(invoice.vatAmount, totalVatHalala, 'vatAmount');
        validateHeaderHalala(invoice.payableAmount, totalInclusiveHalala, 'payableAmount');

        // f. Sign Consistency Check for Credit Notes
        if (isCreditNote) {
            // Ensure either all totals are negative OR all are positive (ERP strategy check)
            const amounts = [invoice.totalAmount, invoice.vatAmount, invoice.taxExclusiveAmount].filter(v => v !== undefined).map(v => Number(v));
            const allNegative = amounts.every(v => v < 0);
            const allPositive = amounts.every(v => v >= 0);
            if (!allNegative && !allPositive) {
                errors.push({ field: 'documentType', issue: 'Mixed signs detected in Credit Note. Use either all positive (with reversal logic) or all negative values.' });
            }
        }

        // g. Header Discount Guard
        if (invoice.allowanceCharge || invoice.discountAmount) {
            errors.push({ field: 'discountAmount', issue: 'Header-level discounts are not supported. Distribute discounts across line items for precise tax subtotal compliance.' });
        }
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

