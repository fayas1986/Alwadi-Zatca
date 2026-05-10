import prisma from '../lib/prisma.js';
import { signInvoice } from './sdkService.js';
import { reportInvoice, clearInvoice } from './zatcaService.js';
import { NotificationService } from './notificationService.js';
import { AuditService } from './auditService.js';
import { SecurityService } from './securityService.js';
import { LockService } from './lockService.js';
import { generateInvoiceXML } from './xmlService.js';
import { reflectStatusToERP } from './integrationService.js';
import { invoice_status } from '@prisma/client';
import { INITIAL_PIH } from '../utils/api-helpers.js';

interface QueueItem {
    invoiceId: number;
    companyId: number;
    environment: string;
    retryCount: number;
}

export class QueueService {
    private static isProcessing: Record<number, boolean> = {};
    private static lastRequestTime: Record<number, number> = {}; // For per-EGS rate limiting
    private static lastTenantRequestTime: Record<number, number> = {}; // For per-tenant rate limiting
    private consecutiveFailures = 0;
    private circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
    private circuitOpenUntil = 0;
    private readonly RATE_LIMIT_MS = 200; // 5 requests per second per EGS
    private readonly TENANT_LIMIT_MS = 100; // Global 10 requests per second per Company
    private readonly CIRCUIT_FAILURE_THRESHOLD = 5;
    private readonly CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
    private readonly HALF_OPEN_LIMIT = 1; // Only 1 request allowed in half-open state

    static async resume() {
        try {
            const pendingCompanies = await prisma.invoice.findMany({
                where: { status: 'PENDING' as any },
                distinct: ['company_id'],
                select: { company_id: true }
            });
            console.log(`[Queue] Resuming processing for ${pendingCompanies.length} companies with pending invoices.`);
            for (const item of pendingCompanies) {
                this.enqueue({ invoiceId: 0, companyId: item.company_id, environment: 'PRODUCTION', retryCount: 0 });
            }
        } catch (error) {
            console.error('[Queue] Resume failed:', error);
        }
    }

    static async enqueue(item: QueueItem) {
        console.log(`[Queue] Enqueued invoice ${item.invoiceId} for company ${item.companyId}. Attempt: ${item.retryCount + 1}`);
        const service = new QueueService();
        service.processQueue(item.companyId);
    }

    private async processQueue(companyId: number) {
        if (QueueService.isProcessing[companyId]) return;

        // Circuit Breaker Logic
        if (this.circuitState === 'OPEN') {
            if (Date.now() > this.circuitOpenUntil) {
                this.circuitState = 'HALF_OPEN';
                console.log(`[Queue] Circuit is now HALF_OPEN. Testing with 1 request...`);
            } else {
                console.warn(`[Queue] Circuit is OPEN. Skipping processing for company ${companyId}.`);
                return;
            }
        }

        QueueService.isProcessing[companyId] = true;

        try {
            while (true) {
                // Fetch NEXT PENDING invoice for this company
                const nextInvoice = await prisma.invoice.findFirst({
                    where: { 
                        company_id: companyId,
                        status: 'PENDING' as any
                    },
                    orderBy: { created_at: 'asc' },
                    include: { company: { include: { certificates: true } } }
                });

                if (!nextInvoice) break;

                // EDGE: Per-Tenant Global Rate Limit (10 req/sec)
                const now = Date.now();
                const lastTenantTime = QueueService.lastTenantRequestTime[companyId] || 0;
                const tenantDiff = now - lastTenantTime;
                if (tenantDiff < this.TENANT_LIMIT_MS) {
                    await new Promise(resolve => setTimeout(resolve, this.TENANT_LIMIT_MS - tenantDiff));
                }
                QueueService.lastTenantRequestTime[companyId] = Date.now();

                await this.handleInvoiceSubmission(nextInvoice);
            }
        } finally {
            QueueService.isProcessing[companyId] = false;
        }
    }

    private async handleInvoiceSubmission(invoice: any) {
        const company = invoice.company;
        const companyId = company.id;
        console.log(`[Queue] Submitting invoice ${invoice.invoice_number} (ID: ${invoice.id})...`);

        // ENT 1: Distributed Locking (Prevention of duplicate processing across workers)
        const lockAcquired = await LockService.acquire(`invoice:${invoice.id}`);
        if (!lockAcquired) {
            console.warn(`[Queue] Invoice ${invoice.id} is already being processed by another worker. Skipping.`);
            return;
        }

        try {
            const cert = company.certificates.find((c: any) => c.is_active && c.type === company.environment);
            if (!cert) throw new Error('No active certificate found');

            // Rate Limit Check (Per-EGS: 5 req/sec)
            const now = Date.now();
            const lastTime = QueueService.lastRequestTime[cert.id] || 0;
            const diff = now - lastTime;
            if (diff < this.RATE_LIMIT_MS) {
                await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_MS - diff));
            }
            QueueService.lastRequestTime[cert.id] = Date.now();

            // ENT 2: Field-Level Decryption
            const decryptedSecret = SecurityService.decrypt(cert.secret!);
            
            // PIH: Find the last submitted invoice hash for this company
            // We use a TRANSACTION with a LOCK to prevent multiple workers from reading the same PIH
            const { pih, lastInvoiceId } = await prisma.$transaction(async (tx) => {
                // LOCK the company row to ensure only one worker processes this company at a time
                await tx.$executeRaw`SELECT id FROM companies WHERE id = ${companyId} FOR UPDATE`;

                const prev = await tx.invoice.findFirst({
                    where: {
                        company_id: companyId,
                        OR: [
                            { hash: { not: null } },
                            { zatca_hash: { not: null } }
                        ],
                        status: { not: 'FAILED' } // Only chain from successful/pending ones
                    },
                    orderBy: { id: 'desc' },
                    select: { id: true, hash: true, zatca_hash: true }
                });

                return {
                    pih: prev?.zatca_hash || prev?.hash || INITIAL_PIH,
                    lastInvoiceId: prev?.id
                };
            });

            // NEW: Handle JSON payloads from API V1 (Async manual submissions)
            let xmlToSign = invoice.xml_payload;
            if (invoice.xml_payload && (invoice.xml_payload.trim().startsWith('{') || invoice.xml_payload.trim().startsWith('['))) {
                try {
                    const jsonData = JSON.parse(invoice.xml_payload);
                    // Inject PIH into JSON before XML generation
                    jsonData.previousInvoiceHash = pih;
                    xmlToSign = generateInvoiceXML(jsonData);
                } catch (e) {
                    console.error(`[Queue] Failed to parse JSON payload for invoice ${invoice.id}`);
                }
            }

            // OPT 3: Step-Level Metrics (Time to Sign)
            const signStart = Date.now();
            const { signedXml, hash, qr } = await signInvoice(xmlToSign, cert.certificate, decryptedSecret);
            const signDuration = Date.now() - signStart;
            
            const localHash = hash || invoice.hash;
            const isProxySubmission = (invoice.metadata as any)?.source === 'API_V2_FINAL';

            // Micro-GAP 2: Hash Consistency Check
            if (hash && hash !== invoice.hash) {
                if (isProxySubmission) {
                    console.log(`[Queue] Updating temporary hash for proxy invoice ${invoice.id}. Old: ${invoice.hash}, New: ${hash}`);
                    // We proceed and the hash will be updated in the DB update call below
                } else {
                    // OPT 2: Enhanced Hash Audit Trace
                    await AuditService.log({
                        action: 'HASH_MISMATCH_TRACE',
                        category: 'Security',
                        user: 'System',
                        role: 'SYSTEM',
                        ipAddress: '127.0.0.1',
                        details: `Local: ${invoice.hash}, ZATCA: ${hash}`,
                        status: 'Failure',
                        resourceId: invoice.id.toString(),
                        metadata: { localHash: invoice.hash, zatcaHash: hash }
                    });
                    console.error(`[Queue] HASH MISMATCH for invoice ${invoice.id}. Expected: ${invoice.hash}, Received: ${hash}`);
                    throw new Error(`Hash Mismatch: Local=${invoice.hash}, ZATCA=${hash}`);
                }
            }

            // Explicit ZATCA Flow Routing:
            // STANDARD -> Clearance (ClearInvoice)
            // SIMPLIFIED -> Reporting (ReportInvoice)
            const submitStart = Date.now();
            const useClearance = (invoice.invoice_subtype === 'STANDARD');
            const result = await (useClearance ? clearInvoice : reportInvoice)(
                company.environment,
                cert.csid!,
                decryptedSecret,
                localHash,
                Buffer.from(signedXml).toString('base64'),
                invoice.uuid
            );
            const submitDuration = Date.now() - submitStart;

            const isSuccess = (result.reportingStatus === 'REPORTED' || result.clearanceStatus === 'CLEARED');

            if (isSuccess) {
                // OPT 5: Circuit Breaker Reset
                this.consecutiveFailures = 0;
                this.circuitState = 'CLOSED';

                await prisma.invoice.update({
                    where: { id: invoice.id },
                    data: {
                        status: company.environment === 'PRODUCTION' ? (invoice.type === 'B2B' ? 'CLEARED' : 'REPORTED') : 'REPORTED',
                        hash: localHash,
                        zatca_hash: hash, // Store official signed hash
                        previous_invoice_hash: pih, // Store the PIH used
                        submission_response: JSON.stringify(result),
                        cleared_xml_payload: result.clearedInvoice || null,
                        qr_code: qr || invoice.qr_code,
                        retry_count: 0,
                        metadata: {
                            ...(invoice.metadata as any || {}),
                            performance: {
                                time_to_sign_ms: signDuration,
                                time_to_submit_ms: submitDuration,
                                total_processing_ms: Date.now() - (invoice.created_at?.getTime() || Date.now())
                            },
                            steps: [
                                ...(invoice.metadata as any)?.steps || [],
                                { step: 'ZATCA_PROCESSED', timestamp: new Date().toISOString() }
                            ]
                        } as any
                    } as any
                });

                // NEW: Reflect successful background processed status to ERP
                const finalStatus = company.environment === 'PRODUCTION' ? (invoice.type === 'B2B' ? 'CLEARED' : 'REPORTED') : 'REPORTED';
                await reflectStatusToERP(invoice.company_id, invoice.invoice_number, invoice.uuid, finalStatus, result);

                await AuditService.log({
                    action: 'ZATCA_SUBMISSION_SUCCESS',
                    category: 'Compliance',
                    user: 'System',
                    role: 'SYSTEM',
                    ipAddress: '127.0.0.1',
                    status: 'Success',
                    details: `Successfully ${finalStatus.toLowerCase()} invoice ${invoice.invoice_number} to ZATCA.`,
                    resourceId: invoice.id.toString(),
                    payload: result.clearedInvoice || signedXml,
                    metadata: { 
                        invoiceNumber: invoice.invoice_number, 
                        uuid: invoice.uuid,
                        zatcaResponse: result 
                    }
                });
            } else {
                throw new Error(`ZATCA Submission Failed: ${JSON.stringify(result.validationResults || result)}`);
            }

        } catch (error: any) {
            console.error(`[Queue] Error processing invoice ${invoice.id}:`, error.message);
            await this.handleFailure(invoice, error.message || 'Unknown error');
        } finally {
            // ENT 1: Release Lock
            await LockService.release(`invoice:${invoice.id}`);
        }
    }

    private async handleFailure(invoice: any, reason: string) {
        const nextRetryCount = (invoice.retry_count || 0) + 1;
        const maxRetries = 3;

        // OPT 5: Circuit Breaker Failure Counting
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= this.CIRCUIT_FAILURE_THRESHOLD) {
            this.circuitState = 'OPEN';
            this.circuitOpenUntil = Date.now() + this.CIRCUIT_COOLDOWN_MS;
            await NotificationService.alert({
                title: 'Circuit Breaker OPEN',
                message: `ZATCA API is experiencing high failure rates. pausing submissions for 5 mins.`,
                companyId: invoice.company_id,
                severity: 'CRITICAL'
            });
        }

        if (nextRetryCount <= maxRetries) {
            const nextAttemptAt = new Date(Date.now() + Math.pow(2, nextRetryCount) * 1000 * 60); // Exponential backoff
            await prisma.invoice.update({
                where: { id: invoice.id },
                data: {
                    status: 'PENDING' as any,
                    retry_count: nextRetryCount,
                    next_attempt_at: nextAttemptAt,
                    error_log: reason
                } as any
            });

            // NEW: Reflect retry/pending status to ERP
            await reflectStatusToERP(invoice.company_id, invoice.invoice_number, invoice.uuid, 'PENDING', { reason });

            await this.logActivity(invoice, 'Retry Scheduled', `Retry ${nextRetryCount}/${maxRetries} scheduled for ${nextAttemptAt.toISOString()}. Reason: ${reason}`);
        } else {
            await this.moveToDLQ(invoice, reason);
        }
    }

    private async moveToDLQ(invoice: any, errorMsg: string) {
        await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
                status: 'DLQ' as any,
                error_log: errorMsg,
                retry_count: (invoice.retry_count || 0) + 1
            } as any
        });

        // NEW: Reflect REJECTED (DLQ) status to ERP
        await reflectStatusToERP(invoice.company_id, invoice.invoice_number, invoice.uuid, 'FAILED', { reason: errorMsg });

        await this.logActivity(invoice, 'Failure', `Invoice moved to DLQ. Reason: ${errorMsg}`);
        
        await NotificationService.alert({
            title: 'Invoice Failed (DLQ)',
            message: `Invoice ${invoice.invoice_number} failed after max retries.`,
            companyId: invoice.company_id,
            severity: 'CRITICAL'
        });
    }

    private async logActivity(invoice: any, status: string, details: string) {
        await AuditService.log({
            action: 'Queue_Processing',
            category: 'Compliance',
            user: 'System',
            role: 'SYSTEM',
            ipAddress: '127.0.0.1',
            status: status as any,
            details: details,
            resourceId: invoice.id.toString(),
            metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoice_number }
        });
    }
}
export default QueueService;
