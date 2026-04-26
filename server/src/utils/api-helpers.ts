
import { Response } from 'express';
import crypto from 'crypto';

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
        timestamp: new Date().toISOString()
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

    // 2. Normalize Credit Note negative values internally
    // ZATCA requires positive values; document type denotes the subtraction
    const isNote = payload.documentType === 'Credit Note' || payload.documentType === 'Debit Note' || payload.documentType === 'CREDIT_NOTE' || payload.documentType === 'DEBIT_NOTE';
    if (isNote) {
        if (payload.totalAmount !== undefined) payload.totalAmount = Math.abs(Number(payload.totalAmount));
        if (payload.vatAmount !== undefined) payload.vatAmount = Math.abs(Number(payload.vatAmount));
        if (payload.taxExclusiveAmount !== undefined) payload.taxExclusiveAmount = Math.abs(Number(payload.taxExclusiveAmount));
    }

    if (!payload.items || !Array.isArray(payload.items)) return payload;
    
    let totalTax = 0;
    let totalTaxExclusive = 0;
    
    const items = payload.items.map((item: any) => {
        const qty = isNote ? Math.abs(Number(item.quantity || 1)) : Number(item.quantity || 1);
        const price = isNote ? Math.abs(Number(item.unitPrice || 0)) : Number(item.unitPrice || 0);
        let subtotal = Number(item.subtotal || item.lineTotal || (qty * price));
        if (isNote) subtotal = Math.abs(subtotal);

        // Use vatRate as a percentage (e.g. 15) or fraction (e.g. 0.15) — normalize first
        let vatRate = Number(item.vatRate ?? 0.15);
        // If vatRate is small (e.g. 0.15), it's a fraction. If it's e.g. 15, it's a percentage.
        const fraction = vatRate < 1 ? vatRate : vatRate / 100;

        // Trust item.taxAmount if already resolved by normalizer; only recalculate as fallback
        let tax = (item.taxAmount !== undefined && item.taxAmount !== null)
            ? Number(Number(item.taxAmount).toFixed(2))
            : (item.vatAmount !== undefined && item.vatAmount !== null) 
                ? Number(Number(item.vatAmount).toFixed(2))
                : Number((subtotal * fraction).toFixed(2));
                
        if (isNote) tax = Math.abs(tax);
        
        const roundedSubtotal = Number(subtotal.toFixed(2));
        totalTax += tax;
        totalTaxExclusive += roundedSubtotal;

        return {
            ...item,
            quantity: qty,
            unitPrice: Number(price.toFixed(2)),
            subtotal: roundedSubtotal,
            lineTotal: roundedSubtotal,
            taxAmount: tax,
            vatAmount: tax,
            total: Number((roundedSubtotal + tax).toFixed(2)),
            totalWithVat: Number((roundedSubtotal + tax).toFixed(2))
        };
    });

    const totalCalculated = totalTaxExclusive + totalTax;

    // Enforce perfect math for ZATCA (overwrite header totals with exact sum of lines to prevent fractional mismatches)
    const updated = { ...payload, items };
    updated.vatAmount = Number(totalTax.toFixed(2));
    updated.taxExclusiveAmount = Number(totalTaxExclusive.toFixed(2));
    updated.totalAmount = Number(totalCalculated.toFixed(2));
    
    return updated;
};

/**
 * Automates compliance field injection for ZATCA standard/simplified invoices
 */
export const injectComplianceFields = (payload: any, type: string) => {
    // First, ensure totals are calculated if missing
    let injected = calculateInvoiceTotals(payload);
    
    // 1. UUID Generation
    if (!injected.uuid) injected.uuid = crypto.randomUUID();
    
    // 2. Invoice Type Code (ZATCA standards)
    // 0100000 = Standard, 0200000 = Simplified
    if (!injected.invoiceTypeCode) {
        injected.invoiceTypeCode = (payload.invoiceSubtype === 'Standard' || type === 'Standard') ? '0100000' : '0200000';
    }
    
    // 3. Currency Default
    if (!injected.currencyCode) injected.currencyCode = 'SAR';
    
    return injected;
};
