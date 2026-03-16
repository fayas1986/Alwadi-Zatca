
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

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
    /**
     * Creates a new audit log entry
     */
    static async log(params: AuditLogParams) {
        try {
            // Generate integrity hash of the log entry content
            const contentToHash = `${params.timestamp || new Date().toISOString()}|${params.action}|${params.user}|${params.details}|${params.status}`;
            const hash = crypto.createHash('sha256').update(contentToHash).digest('hex');

            const logEntry = await prisma.audit_log.create({
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

            return logEntry;
        } catch (error) {
            console.error('Failed to create audit log:', error);
            // We don't throw here to avoid crashing the main process if logging fails
            return null;
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
        if (filters.user) where.user = { contains: filters.user, mode: 'insensitive' };
        if (filters.action) where.action = { contains: filters.action, mode: 'insensitive' };
        
        const [logs, total] = await Promise.all([
            prisma.audit_log.findMany({
                where,
                orderBy: { timestamp: 'desc' },
                skip,
                take: limit
            }),
            prisma.audit_log.count({ where })
        ]);

        return {
            logs,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        };
    }
}
