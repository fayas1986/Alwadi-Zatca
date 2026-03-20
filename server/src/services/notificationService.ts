
import { AuditService } from './auditService.js';

export class NotificationService {
    private static lastAlertTimes: Map<string, number> = new Map();
    private static readonly COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

    /**
     * Sends an alert to administrators and logs it to the audit trail
     */
    static async alert(params: {
        title: string;
        message: string;
        severity: 'CRITICAL' | 'WARNING' | 'INFO';
        companyId?: number;
        metadata?: any;
    }) {
        const alertKey = `${params.title}:${params.companyId || 'global'}`;
        const lastAlert = this.lastAlertTimes.get(alertKey) || 0;
        const now = Date.now();

        if (now - lastAlert < this.COOLDOWN_MS && params.severity !== 'CRITICAL') {
            console.log(`[Notification] Alert suppressed due to cooldown: ${params.title}`);
            return;
        }

        this.lastAlertTimes.set(alertKey, now);

        console.error(`[ALERT] [${params.severity}] ${params.title}: ${params.message}`);

        // For now, we log these critical system alerts to the AuditLog
        await AuditService.log({
            action: `SYSTEM_ALERT: ${params.title}`,
            category: 'System',
            user: 'System-Alert',
            role: 'SYSTEM',
            ipAddress: '127.0.0.1',
            details: params.message,
            status: params.severity === 'CRITICAL' ? 'Failure' : (params.severity === 'WARNING' ? 'Warning' : 'Success'),
            resourceId: params.companyId?.toString(),
            metadata: params.metadata
        });

        // EXTENSION: Add Webhook, Mail, or Slack integration here
        if (process.env.ALERT_WEBHOOK_URL) {
            try {
                // await fetch(process.env.ALERT_WEBHOOK_URL, { ... });
            } catch (e) {
                console.error('Failed to send webhook alert:', e);
            }
        }
    }

    static async notifyDLQSpike(companyId: number, count: number) {
        await this.alert({
            title: 'DLQ Spike Detected',
            message: `Company ${companyId} has ${count} invoices moved to DLQ in a short period.`,
            severity: 'CRITICAL',
            companyId
        });
    }

    static async notifyCertificateExpiry(companyId: number, daysLeft: number) {
        await this.alert({
            title: 'Certificate Expiry Warning',
            message: `The ZATCA certificate for company ${companyId} will expire in ${daysLeft} days.`,
            severity: daysLeft < 7 ? 'CRITICAL' : 'WARNING',
            companyId
        });
    }

    static async notifyZatcaDowntime(error: string) {
        await this.alert({
            title: 'ZATCA Connection Failure',
            message: `Persistent connectivity issues with ZATCA API: ${error}`,
            severity: 'CRITICAL'
        });
    }
}
