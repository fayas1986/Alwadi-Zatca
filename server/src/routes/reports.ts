
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import prisma from '../lib/prisma.js';

const router = Router();

// Middleware copied from admin.ts for consistency
const requireSuperAdmin = (req: any, res: any, next: any) => {
    const userRole = req.headers['x-user-role'];
    if (userRole !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Access Denied: Super Admin only' });
    }
    next();
};

const requireAnyAdmin = (req: any, res: any, next: any) => {
    const userRole = req.headers['x-user-role'];
    const allowedRoles = ['SUPER_ADMIN', 'IT_ADMIN', 'FINANCE_ADMIN', 'TAX_OFFICER'];
    if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ error: 'Access Denied: Unauthorized role' });
    }
    next();
};


// POST /api/admin/reports/datapreview - Preview report data without saving
router.post('/datapreview', requireAnyAdmin, async (req, res) => {
    try {
        const { config } = req.body;
        const userRole = req.headers['x-user-role'] as string;
        const userEmail = req.headers['x-user-email'] as string;

        if (!config || !config.columns) {
            return res.status(400).json({ error: 'Config with columns is required' });
        }

        const sourceModel = config.sourceModel || 'invoice';

        // Strict Isolation Logic (same as generate)
        const where: any = {};
        if (userRole !== 'SUPER_ADMIN') {
            const user = await prisma.user.findUnique({ where: { email: userEmail } });
            if (!user) return res.status(403).json({ error: 'User not found for isolation' });

            if (sourceModel === 'invoice') {
                where.company = {
                    OR: [
                        { user_id: user.id },
                        { registered_name: user.company_name || '___NEVER_MATCH___' }
                    ]
                };
            } else if (sourceModel === 'audit_log') {
                where.user = userEmail;
            } else if (sourceModel === 'company') {
                if (user.company_name) {
                    where.OR = [
                        { user_id: user.id },
                        { registered_name: user.company_name }
                    ];
                } else {
                    where.user_id = user.id;
                }
            }
        }

        // Fetch small sample (limit 5)
        let data: any[] = [];
        if (sourceModel === 'invoice') {
            data = await prisma.invoice.findMany({
                where,
                take: 5,
                include: { company: true, customer: true }
            });
        } else if (sourceModel === 'audit_log') {
            data = await prisma.audit_log.findMany({ where, take: 5 });
        } else if (sourceModel === 'company') {
            data = await prisma.company.findMany({
                where,
                take: 5,
                include: { group: true, user: true }
            });
        }

        // Transform data based on mapping
        const mappedData = data.map(item => {
            const row: any = {};
            config.columns.forEach((col: any) => {
                const value = col.key.split('.').reduce((obj: any, key: string) => obj?.[key], item);
                row[col.label || col.key] = value || '';
            });
            return row;
        });

        res.json(mappedData);

    } catch (error: any) {
        console.error('[Reports] Preview Error:', error);
        res.status(500).json({ error: 'Failed to preview report', details: error.message });
    }
});

// GET /api/admin/reports/templates - List all templates
router.get('/templates', requireAnyAdmin, async (req, res) => {
    try {
        const templates = await prisma.report_template.findMany({
            orderBy: { name: 'asc' }
        });
        res.json(templates);
    } catch (error) {
        console.error('[Reports] Error fetching templates:', error);
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
});

// POST /api/admin/reports/templates - Create/Update template (Super Admin only)
router.post('/templates', requireSuperAdmin, async (req, res) => {
    console.log('[Reports] POST /templates received');
    try {
        const { id, name, description, category, config } = req.body;
        console.log('[Reports] Body data:', { id, name });

        if (!name || !config) {
            return res.status(400).json({ error: 'Name and config are required' });
        }

        if (id) {
            const updated = await prisma.report_template.update({
                where: { id: Number(id) },
                data: { name, description, category, config }
            });
            return res.json(updated);
        } else {
            const created = await prisma.report_template.create({
                data: { name, description, category, config }
            });
            return res.json(created);
        }
    } catch (error) {
        console.error('[Reports] Error saving template:', error);
        res.status(500).json({ error: 'Failed to save template' });
    }
});

// DELETE /api/admin/reports/templates/:id
router.delete('/templates/:id', requireSuperAdmin, async (req, res) => {
    try {
        await prisma.report_template.delete({
            where: { id: parseInt(req.params.id) }
        });
        res.json({ message: 'Template deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete template' });
    }
});


// POST /api/admin/reports/generate/:id - Generate report data
router.post('/generate/:id', requireAnyAdmin, async (req, res) => {
    try {
        const templateId = parseInt(req.params.id);
        const { dateRange, format = 'json' } = req.body;
        const userRole = req.headers['x-user-role'];
        const userEmail = req.headers['x-user-email'] as string;

        const template = await prisma.report_template.findUnique({
            where: { id: templateId }
        });

        if (!template) return res.status(404).json({ error: 'Template not found' });

        const config = template.config as any;
        const sourceModel = config.sourceModel || 'invoice'; // Default to invoice

        // Strict Isolation Logic
        const where: any = {};
        if (userRole !== 'SUPER_ADMIN') {
            const user = await prisma.user.findUnique({ where: { email: userEmail } });
            if (!user) return res.status(403).json({ error: 'User not found for isolation' });

            // Map source model to its company/user filter
            if (sourceModel === 'invoice') {
                where.company = {
                    OR: [
                        { user_id: user.id },
                        { registered_name: user.company_name || '___NEVER_MATCH___' }
                    ]
                };
            } else if (sourceModel === 'audit_log') {
                where.user = userEmail; // Audit logs use user email string usually
            } else if (sourceModel === 'company') {
                if (user.company_name) {
                    where.OR = [
                        { user_id: user.id },
                        { registered_name: user.company_name }
                    ];
                } else {
                    where.user_id = user.id;
                }
            }
        }

        // Apply Date Range if provided
        if (dateRange && dateRange.start && dateRange.end) {
            where.created_at = {
                gte: new Date(dateRange.start),
                lte: new Date(dateRange.end)
            };
        }

        // Fetch Data Dynamically
        // Note: In a real app we'd use a more robust dynamic query builder
        let data: any[] = [];
        if (sourceModel === 'invoice') {
            data = await prisma.invoice.findMany({
                where,
                include: {
                    company: true,
                    customer: true
                }
            });
        } else if (sourceModel === 'audit_log') {
            data = await prisma.audit_log.findMany({ where });
        } else if (sourceModel === 'company') {
            data = await prisma.company.findMany({
                where,
                include: {
                    group: true,
                    user: true
                }
            });
        }

        // Transform data based on mapping
        const mappedData = data.map(item => {
            const row: any = {};
            config.columns.forEach((col: any) => {
                // Handle nested paths like company.registered_name
                const value = col.key.split('.').reduce((obj: any, key: string) => obj?.[key], item);
                row[col.label] = value || '';
            });
            return row;
        });

        if (format === 'csv') {
            if (mappedData.length === 0) return res.send('');
            const headers = Object.keys(mappedData[0]);
            const csvRows = [
                headers.join(','),
                ...mappedData.map(row => headers.map(h => `"${row[h]}"`).join(','))
            ];
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${template.name}.csv"`);
            return res.send(csvRows.join('\n'));
        }

        res.json(mappedData);

    } catch (error: any) {
        console.error('[Reports] Generation Error:', error);
        res.status(500).json({ error: 'Failed to generate report', details: error.message });
    }
});

export default router;
