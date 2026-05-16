import { NotificationService } from '../services/notificationService.js';
import { AuditService } from '../services/auditService.js';
import { PrivacyService } from '../services/privacyService.js';

/**
 * Mask a string for logs (Delegates to PrivacyService)
 */
export const mask = (value: any): string => {
    return (PrivacyService as any).mask(value);
};

/**
 * Mask sensitive data for objects (Delegates to PrivacyService)
 */
export const maskSensitiveData = (data: any): any => {
    return PrivacyService.scrubObject(data);
};

/**
 * Clock Drift Check for KSA Time
 */
export const checkClockDrift = async () => {
    try {
        const response = await fetch('http://worldtimeapi.org/api/timezone/Asia/Riyadh');
        const data = await response.json();
        const externalTime = new Date(data.datetime).getTime();
        const localTime = Date.now() + (3 * 60 * 60 * 1000); // KSA Offset
        const drift = Math.abs(externalTime - localTime);

        if (drift > 5000) { // 5 seconds
            await NotificationService.alert({
                title: 'CRITICAL: Clock Drift Detected',
                message: `Server clock is out of sync with KSA time by ${Math.round(drift / 1000)} seconds. This WILL cause ZATCA rejections.`,
                severity: 'CRITICAL'
            });
        } else {
            console.log(`[System] Clock drift check passed. Drift: ${drift}ms`);
        }
    } catch (error) {
        console.warn('[System] Failed to check clock drift:', error);
    }
};

/**
 * Helper to log activity with security masking
 */
export const logZatcaActivity = async (params: {
    action: string;
    status: 'Success' | 'Failure' | 'Warning';
    details: string;
    user?: string;
    role?: string;
    ipAddress?: string;
    resourceId?: string;
    metadata?: any;
}) => {
    const { action, status, details, user = 'System', role = 'SYSTEM', ipAddress = '127.0.0.1', resourceId, metadata } = params;
    
    try {
        await AuditService.log({
            action,
            category: 'Compliance',
            user,
            role,
            ipAddress,
            details,
            status: status as any,
            resourceId,
            metadata
        });
    } catch (e) {
        console.error('Failed to log ZATCA activity:', e);
    }
};

/**
 * Maps String environment to Prisma enum
 */
export const mapEnv = (env: string) => {
    switch (env.toLowerCase()) {
        case 'simulation': return 'SIMULATION';
        case 'production': return 'PRODUCTION';
        default: return 'SANDBOX';
    }
};
