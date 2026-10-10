
import { Router } from 'express';
import { AuditService } from '../services/auditService.js';
import { authenticateJWT, requireVerifiedAdmin, AuthenticatedRequest } from '../middleware/authMiddleware.js';

const router = Router();

/**
 * @swagger
 * /api/audit-logs:
 *   get:
 *     summary: Retrieve system audit logs
 *     tags: [Admin]
 */
router.get('/', authenticateJWT, requireVerifiedAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const { category, status, user, action } = req.query;

        // Non-SUPER_ADMIN users are scoped to their own logs or authorized company context
        const filterUser = req.user?.role === 'SUPER_ADMIN' ? (user as string) : req.user?.email;

        const result = await AuditService.getLogs(
            { category, status, user: filterUser, action },
            page,
            limit
        );

        console.log(`[Audit Route] Returning ${result.logs.length} logs for user ${req.user?.email}. Total: ${result.total}`);

        res.json({
            success: true,
            data: result.logs,
            pagination: {
                total: result.total,
                page: result.page,
                totalPages: result.totalPages
            }
        });
    } catch (error: any) {
        console.error('API Error: GET /api/audit-logs', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve audit logs',
            error: error.message
        });
    }
});

export default router;
