import axios from 'axios';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { AuditService } from './auditService.js';

export class WebhookService {
    private static readonly RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000]; // 1s, 2s, 5s, 10s, 30s

    /**
     * Dispatches a webhook with HMAC signing and exponential backoff
     */
    static async sendWebhook(companyId: number, event: string, data: any) {
        const company = await prisma.company.findUnique({
            where: { id: companyId }
        });

        if (!company || !company.settings) return;

        const settings = company.settings as any;
        const webhookUrl = settings.webhookUrl;
        const webhookSecret = settings.webhookSecret;

        if (!webhookUrl || !webhookSecret) {
            console.log(`[Webhook] Skipping: No URL or Secret configured for company ${companyId}`);
            return;
        }

        const payload = {
            event,
            jobId: data.jobId || data.uuid,
            invoiceNumber: data.invoiceNumber || data.invoice_number,
            status: data.status,
            timestamp: new Date().toISOString(),
            nonce: crypto.randomUUID(), // Extra replay protection (Requirement 1)
            data: {
                zatca: data.zatcaResponse || data.zatca || {},
                compliance: data.compliance || {
                    uuid: data.uuid,
                    hash: data.hash,
                    qrGenerated: !!data.qr_code
                }
            }
        };

        // Generate HMAC signature (Requirement 1 & 3)
        const signature = crypto
            .createHmac('sha256', webhookSecret)
            .update(JSON.stringify(payload))
            .digest('hex');

        this.dispatch(webhookUrl, payload, signature, companyId, 0);
    }

    private static async dispatch(url: string, payload: any, signature: string, companyId: number, attempt: number) {
        try {
            console.log(`[Webhook] Dispatching ${payload.event} to ${url} (Attempt ${attempt + 1})...`);
            
            const response = await axios.post(url, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-webhook-signature': signature,
                    'User-Agent': 'ZATCA-Enterprise-Webhook/2.0'
                },
                timeout: 5000
            });

            await this.logDelivery(companyId, payload, attempt, true, response.status);
            console.log(`[Webhook] Successfully delivered to ${url}`);

        } catch (error: any) {
            console.error(`[Webhook] Delivery failed (Attempt ${attempt + 1}): ${error.message}`);
            
            await this.logDelivery(companyId, payload, attempt, false, error.response?.status || 0, error.message);

            if (attempt < this.RETRY_DELAYS.length) {
                const delay = this.RETRY_DELAYS[attempt];
                console.log(`[Webhook] Retrying in ${delay}ms...`);
                setTimeout(() => this.dispatch(url, payload, signature, companyId, attempt + 1), delay);
            } else {
                console.error(`[Webhook] Maximum retries reached for ${url}. Moving to DLQ.`);
                await this.logDelivery(companyId, payload, attempt, false, 0, 'MAX_RETRIES_REACHED (DEAD_LETTER)');
            }
        }
    }

    private static async logDelivery(companyId: number, payload: any, attempt: number, success: boolean, statusCode: number, error?: string) {
        try {
            await AuditService.log({
                action: `WEBHOOK_DELIVERY: ${payload.event}`,
                category: 'Operational',
                user: 'System',
                role: 'SYSTEM',
                ipAddress: '127.0.0.1',
                details: success ? `Delivered with status ${statusCode}` : `Failed: ${error}`,
                status: success ? 'Success' : 'Failure',
                resourceId: companyId.toString(),
                metadata: {
                    jobId: payload.jobId,
                    attempt: attempt + 1,
                    statusCode,
                    payload_summary: { event: payload.event, jobId: payload.jobId }
                }
            });
        } catch (e) {
            console.error('Failed to log webhook delivery:', e);
        }
    }
}
