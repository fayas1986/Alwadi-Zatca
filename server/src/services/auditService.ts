import prisma from '../lib/prisma.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface AuditLogParams {
    action: string;
    category: 'Security' | 'Operational' | 'Compliance' | 'System';
    user: string;
    role: string;
    ipAddress: string;
    details: string;
    status: 'Success' | 'Failure' | 'Warning';
    resourceId?: string;
    metadata?: any;
    timestamp?: string;
}

export class AuditService {
    static async log(params: AuditLogParams) {
        // Fire and forget to avoid blocking real-time operations
        this._privateLog(params).catch(err => {
            console.error('Audit Log (Background) Failed:', err);
        });
        return { success: true, queued: true };
    }

    private static async _privateLog(params: AuditLogParams) {
        try {
            // Generate integrity hash of the log entry content
            const timestamp = params.timestamp || new Date().toISOString();
            const contentToHash = `${timestamp}|${params.action}|${params.user}|${params.details}|${params.status}`;
            const hash = crypto.createHash('sha256').update(contentToHash).digest('hex');

            await (prisma as any).audit_log.create({
                data: {
                    action: params.action,
                    category: params.category,
                    user: params.user,
                    role: params.role,
                    ip_address: params.ipAddress,
                    details: params.details,
                    status: params.status,
                    resource_id: params.resourceId,
                    metadata: params.metadata || {},
                    hash: hash
                }
            });
        } catch (error) {
            console.error('Failed to create audit log entry in DB, falling back to file:', error);
            // Fallback to local file logging
            try {
                const logDir = path.join(process.cwd(), 'logs');
                if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
                const logFile = path.join(logDir, 'audit_failover.log');
                const logLine = JSON.stringify({ ...params, timestamp: new Date().toISOString() }) + '\n';
                fs.appendFileSync(logFile, logLine);
            } catch (fsError) {
                console.error('Critical: Audit Log File Fallback Failed:', fsError);
            }
        }
    }

    /**
     * Retrieves audit logs with filtering and pagination
     */
    static async getLogs(filters: any = {}, page: number = 1, limit: number = 10) {
        const skip = (page - 1) * limit;
        
        const where: any = {};
        if (filters.category && filters.category !== 'All') where.category = filters.category;
        if (filters.status && filters.status !== 'All') where.status = filters.status;
        
        // Handle search term using OR logic for User, Action, or ResourceID
        if (filters.action || filters.user) {
            const searchTerm = filters.action || filters.user;
            where.OR = [
                { user: { contains: searchTerm, mode: 'insensitive' } },
                { action: { contains: searchTerm, mode: 'insensitive' } },
                { details: { contains: searchTerm, mode: 'insensitive' } },
                { resource_id: { contains: searchTerm, mode: 'insensitive' } }
            ];
        }
        
        const [logs, total] = await Promise.all([
            (prisma as any).audit_log.findMany({
                where,
                orderBy: { timestamp: 'desc' },
                skip,
                take: limit
            }),
            (prisma as any).audit_log.count({ where })
        ]);

        return {
            logs,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        };
    }
}
