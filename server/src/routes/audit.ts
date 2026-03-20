
import { Router } from 'express';
import { AuditService } from '../services/auditService.js';

const router = Router();

/**
 * @swagger
 * /api/audit-logs:
 *   get:
 *     summary: Retrieve system audit logs
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: user
 *         schema:
 *           type: string
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 */
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const { category, status, user, action } = req.query;

        const result = await AuditService.getLogs(
            { category, status, user, action },
            page,
            limit
        );

        console.log(`[Audit Route] Returning ${result.logs.length} logs. Total: ${result.total}`);

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
