import { AuditService } from './auditService.js';
import prisma from '../lib/prisma.js';
import QueueService from './queueService.js';

/**
 * Enterprise Submission Queue Service
 * Requirement: Decouple ERP bursts from compliance sequencing.
 * Tech Stack: Recommended BullMQ + Redis
 */
export class SubmissionQueueService {
    /**
     * Enqueues an invoice for asynchronous processing
     * This allows the API to return 202 Accepted immediately.
     */
    static async enqueue(companyId: number, deviceId: string, payload: any): Promise<string> {
        const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        console.log(`[Queue] Enqueueing Job ${jobId} for Device ${deviceId}`);

        // In a real implementation:
        // const job = await submissionQueue.add('process-invoice', { companyId, deviceId, payload }, {
        //    attempts: 5,
        //    backoff: { type: 'exponential', delay: 1000 },
        //    removeOnComplete: true,
        //    priority: payload.isUrgent ? 1 : 10
        // });

        const invoiceDate = payload.issueDate ? new Date(payload.issueDate) : new Date();

        // For now, we simulate the 'Accepted' state in the DB
        await prisma.invoice.create({
            data: {
                company_id: companyId,
                submission_id: jobId,
                status: 'PENDING',
                invoice_number: payload.invoiceNumber,
                date: invoiceDate,
                total_amount: payload.legalMonetaryTotal?.taxInclusiveAmount || 0,
                tax_amount: payload.taxTotal?.taxAmount || 0,
                xml_payload: JSON.stringify(payload),
                // Partial storage until worker picks it up
                metadata: { 
                    queuedAt: new Date().toISOString(),
                    payload: payload,
                    deviceId: deviceId
                }
            }
        });

        await AuditService.log({
            action: 'INVOICE_ENQUEUED',
            category: 'Compliance',
            user: 'ERP_SYSTEM',
            role: 'SYSTEM',
            ipAddress: '127.0.0.1',
            details: `Invoice ${payload.invoiceNumber} queued for asynchronous processing`,
            status: 'Success',
            resourceId: jobId
        });

        // Trigger the background worker
        await QueueService.enqueue({
            invoiceId: 0, // 0 means pick up next pending
            companyId: companyId,
            environment: 'PRODUCTION', // Default to production for worker
            retryCount: 0
        });

        return jobId;
    }

    /**
     * Placeholder for the Worker logic
     * This is where SELECT FOR UPDATE and PIH sequencing happens.
     */
    static async processJob(jobData: any) {
        // 1. Acquire Device Lock
        // 2. Fetch Latest PIH
        // 3. Generate & Sign XML
        // 4. Report to ZATCA
        // 5. Dispatch Webhook
        // 6. Handle Retries/DLQ
    }
}
