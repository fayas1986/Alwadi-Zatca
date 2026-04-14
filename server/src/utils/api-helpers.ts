
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
    if (!payload.items || !Array.isArray(payload.items)) return payload;
    
    let totalTax = 0;
    let totalTaxExclusive = 0;
    
    payload.items.forEach((item: any) => {
        const qty = Number(item.quantity || 1);
        const price = Number(item.unitPrice || 0);
        const subtotal = Number(item.subtotal || (qty * price));
        const vatRate = Number(item.vatRate || 0.15);
        const tax = Number(item.taxAmount || (subtotal * vatRate));
        
        totalTax += tax;
        totalTaxExclusive += subtotal;
    });

    const totalCalculated = totalTaxExclusive + totalTax;

    // Only override if provided totals are 0 or missing (trust ERP if they sent non-zero values)
    const updated = { ...payload };
    if (!updated.vatAmount) updated.vatAmount = Number(totalTax.toFixed(2));
    if (!updated.totalAmount) updated.totalAmount = Number(totalCalculated.toFixed(2));
    if (!updated.taxExclusiveAmount) updated.taxExclusiveAmount = Number(totalTaxExclusive.toFixed(2));
    
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
