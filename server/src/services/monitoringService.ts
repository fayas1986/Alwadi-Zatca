import { NotificationService } from './notificationService.js';
import prisma from '../lib/prisma.js';

export class MonitoringService {
    private static rateLimitSpikes: Map<string, number[]> = new Map();
    private static readonly SPIKE_THRESHOLD = 50; // 50 429s in a window
    private static readonly WINDOW_MS = 60 * 1000; // 1 minute

    /**
     * Tracks a rate-limit (429) event for a client
     */
    static async trackRateLimitSpike(clientId: string) {
        const now = Date.now();
        const timestamps = this.rateLimitSpikes.get(clientId) || [];
        
        // Remove stale timestamps
        const activeTimestamps = timestamps.filter(t => now - t < this.WINDOW_MS);
        activeTimestamps.push(now);
        this.rateLimitSpikes.set(clientId, activeTimestamps);

        if (activeTimestamps.length >= this.SPIKE_THRESHOLD) {
            await NotificationService.alert({
                title: 'Rate Limit Denial Spike',
                message: `Client ${clientId} is experiencing a heavy 429 spike (${activeTimestamps.length} in 60s). Possible DoS or Integration Loop.`,
                severity: 'WARNING',
                metadata: { clientId, count: activeTimestamps.length }
            });
            // Reset to prevent spamming
            this.rateLimitSpikes.set(clientId, []);
        }
    }

    /**
     * Tracks a high-priority job failure
     */
    static async trackJobFailure(jobId: string, companyId: number, error: string) {
        // Log critical failure to notification system
        await NotificationService.alert({
            title: 'Critical Job Failure',
            message: `Invoice job ${jobId} failed permanently for company ${companyId}.`,
            severity: 'CRITICAL',
            companyId,
            metadata: { jobId, error }
        });

        // Check if there's a pattern of failures for this company
        const recentFailures = await prisma.invoice.count({
            where: {
                company_id: companyId,
                status: 'FAILED',
                created_at: { gte: new Date(Date.now() - 30 * 60 * 1000) } // last 30 mins
            }
        });

        if (recentFailures > 10) {
            await NotificationService.alert({
                title: 'High Failure Rate Detected',
                message: `Company ${companyId} has had ${recentFailures} failures in the last 30 minutes.`,
                severity: 'CRITICAL',
                companyId
            });
        }
    }

    /**
     * Tracks webhook delivery failures
     */
    static async trackWebhookFailure(companyId: number, error: string) {
        // Logic to alert if webhooks keep failing (Enterprise SLA)
        await NotificationService.alert({
            title: 'Webhook Delivery Failure',
            message: `Reliability alert: Webhook delivery failed for company ${companyId}.`,
            severity: 'WARNING',
            companyId,
            metadata: { error }
        });
    }
}
