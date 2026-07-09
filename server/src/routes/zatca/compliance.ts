
import { Router } from 'express';
import prisma from '../../lib/prisma.js';
import { ComplianceService } from '../../services/complianceService.js';
import { ZatcaMappingService } from '../../services/zatcaMappingService.js';
import { ResponseHandler } from '../../utils/ResponseHandler.js';

const router = Router();

/**
 * @swagger
 * /api/zatca/onboard:
 *   post:
 *     summary: Onboard a company to ZATCA
 *     tags: [ZATCA - Onboarding]
 */
router.post('/onboard', async (req, res) => {
    try {
        const userEmail = (req.headers['x-user-email'] as string) || 'portal-user';
        const userRole = (req.headers['x-user-role'] as string) || 'USER';
        const ip = req.ip || 'unknown';

        const result = await ComplianceService.onboard(req.body, { email: userEmail, role: userRole, ip });
        return ResponseHandler.success(res, result);
    } catch (error: any) {
        console.error('[Route: Onboard] Error:', error);
        return ResponseHandler.error(res, error.message);
    }
});

/**
 * @swagger
 * /api/zatca/renew:
 *   post:
 *     summary: Renew ZATCA production CSID
 *     tags: [ZATCA - Onboarding]
 */
router.post('/renew', async (req, res) => {
    try {
        const { vat, otp, environment } = req.body;
        const userEmail = (req.headers['x-user-email'] as string) || 'portal-user';
        const userRole = (req.headers['x-user-role'] as string) || 'USER';
        const ip = req.ip || 'unknown';

        const result = await ComplianceService.renew(vat, otp, environment, { email: userEmail, role: userRole, ip });
        return ResponseHandler.success(res, result);
    } catch (error: any) {
        console.error('[Route: Renew] Error:', error);
        return ResponseHandler.error(res, error.message);
    }
});

/**
 * @swagger
 * /api/zatca/certificates:
 *   get:
 *     summary: List all certificates for a company
 *     tags: [ZATCA - Certificates]
 */
router.get('/certificates', async (req, res) => {
    try {
        const { companyId } = req.query;
        if (!companyId) return ResponseHandler.badRequest(res, 'companyId is required');

        const userRole = req.headers['x-user-role'];
        const userEmail = req.headers['x-user-email'] as string;

        const where: any = { company_id: parseInt(companyId as string) };

        if (userRole !== 'SUPER_ADMIN' && userEmail) {
            const user = await prisma.user.findUnique({ where: { email: userEmail } });
            if (user) {
                where.company = {
                    OR: [
                        { user: { email: userEmail } },
                        { registered_name: { equals: user.company_name || '___NEVER_MATCH___', mode: 'insensitive' } }
                    ]
                };
            }
        }

        const certificates = await prisma.certificate.findMany({
            where,
            orderBy: { created_at: 'desc' }
        });

        const mappedCerts = certificates.map((c: any) => ({
            id: c.id.toString(),
            branchId: `br-${c.company_id}`,
            commonName: c.common_name || (c.type === 'PRODUCTION' ? 'Production' : 'Simulation'),
            serialNumber: c.serial_number || 'N/A',
            validFrom: c.created_at.toISOString().split('T')[0],
            validTo: c.expiry_date ? c.expiry_date.toISOString().split('T')[0] : '2099-12-31',
            status: c.is_active ? 'Active' : 'Expired',
            type: c.type,
            hasPrivateKey: !!c.private_key,
            publicKey: c.public_key || ''
        }));

        return ResponseHandler.success(res, mappedCerts);
    } catch (error: any) {
        return ResponseHandler.error(res, error.message);
    }
});

export default router;
