
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
 * Automates compliance field injection for ZATCA standard/simplified invoices
 */
export const injectComplianceFields = (payload: any, type: string) => {
    const injected = { ...payload };
    
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
