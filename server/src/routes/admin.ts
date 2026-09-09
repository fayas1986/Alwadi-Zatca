
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { exec } from 'child_process';

const router = Router();
console.log('[Admin] Admin routes initializing...');
import prisma from '../lib/prisma.js';
import { encrypt } from '../utils/crypto.js';
import { FALLBACK_USERS } from './auth.js';
import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'admin_access.log');
function logAdmin(msg: string) {
    try {
        const time = new Date().toISOString();
        fs.appendFileSync(LOG_FILE, `[${time}] ${msg}\n`);
    } catch(e) {}
}

const cleanBranchName = (name: string | null | undefined): string => {
    if (!name) return 'HQ';
    const cleaned = name.replace(/\b(\w+)(?:\s+\1\b)+/gi, '$1').replace(/(HQ\s*)+/gi, 'HQ').trim();
    return cleaned || 'HQ';
};

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

/**
 * @swagger
 * /api/admin/notifications/recent:
 *   get:
 *     summary: Get recent system alerts for the notification bell
 *     tags: [Admin - Notifications]
 */
router.get('/notifications/recent', requireAnyAdmin, async (req, res) => {
    try {
        const companyId = req.query.companyId as string;
        
        const whereClause: any = {
            category: 'System',
        };
        
        if (companyId && companyId !== 'all') {
            whereClause.OR = [
                { resource_id: companyId },
                { resource_id: null }
            ];
        }

        const alerts = await prisma.audit_log.findMany({
            where: whereClause,
            orderBy: { timestamp: 'desc' },
            take: 15
        });

        res.json(alerts);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

/**
 * @swagger
 * /api/admin/groups:
 *   get:
 *     summary: List all company groups
 *     tags: [Admin - Groups]
 *     parameters:
 *       - in: header
 *         name: x-user-role
 *         required: true
 *         schema:
 *           type: string
 *           default: SUPER_ADMIN
 *     responses:
 *       200:
 *         description: List of groups
 */
router.get('/groups', requireSuperAdmin, async (req, res) => {
    try {
        const groups = await prisma.company_group.findMany({
            include: {
                _count: {
                    select: { companies: true }
                }
            },
            orderBy: { name: 'asc' }
        });
        res.json(groups);
    } catch (error) {
        console.error('Error fetching groups:', error);
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

// POST /api/admin/groups - Create new company group
router.post('/groups', requireSuperAdmin, async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) return res.status(400).json({ error: 'Group name is required' });

        const group = await prisma.company_group.create({
            data: { name, description }
        });
        res.json(group);
    } catch (error) {
        console.error('Error creating group:', error);
        res.status(500).json({ error: 'Failed to create group. Name might already exist.' });
    }
});

// DELETE /api/admin/groups/:id - Delete company group
router.delete('/groups/:id', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const groupId = parseInt(id);

        // Check if group has companies
        const group = await prisma.company_group.findUnique({
            where: { id: groupId },
            include: { _count: { select: { companies: true } } }
        });

        if (group?._count.companies && group._count.companies > 0) {
            return res.status(400).json({ error: 'Cannot delete group with active companies. Unassign them first.' });
        }

        await prisma.company_group.delete({ where: { id: groupId } });
        res.json({ message: 'Group deleted successfully' });
    } catch (error) {
        console.error('Error deleting group:', error);
        res.status(500).json({ error: 'Failed to delete group' });
    }
});


/**
 * @swagger
 * /api/admin/companies:
 *   get:
 *     summary: List all companies
 *     description: Retrieve a list of all companies with their associated users, certificates, and groups.
 *     tags: [Admin - Companies]
 *     parameters:
 *       - in: header
 *         name: x-user-role
 *         required: true
 *         schema:
 *           type: string
 *           default: SUPER_ADMIN
 *     responses:
 *       200:
 *         description: List of companies
 *       403:
 *         description: Access Denied
 */
router.get('/companies', requireAnyAdmin, async (req, res) => {
    try {
        const rawRole = req.headers['x-user-role'] as string;
        const userRole = rawRole?.toUpperCase();
        const userEmail = (req.headers['x-user-email'] as string)?.trim().toLowerCase();

        logAdmin(`>> [ISOLATION] Fetch Request - Role: ${userRole}, Email: ${userEmail}`);

        let companies: any[] = [];
        try {
            companies = await prisma.company.findMany({
                where: { is_deleted: false },
                include: {
                    user: true,
                    certificates: true,
                    group: true
                },
                orderBy: { id: 'asc' }
            });
            logAdmin(`[COMPANIES] DB query returned ${companies.length} companies`);
        } catch (dbErr: any) {
            logAdmin(`[COMPANIES] DB Error: ${dbErr.message?.slice(0, 100)}`);
            if (dbErr.code === 'P2021') {
                return res.json([]);
            }
            throw dbErr;
        }
        
        const organizations = companies.map(c => ({
            id: c.id.toString(),
            name: c.registered_name,
            vatNumber: c.vat_number,
            crNumber: c.cr_number,
            groupName: c.group?.name || 'Unassigned',
            groupId: c.group_id,
            branches: [{
                id: `br-${c.id}`,
                organizationId: c.id.toString(),
                name: cleanBranchName(c.branch_name),
                type: 'HQ',
                environment: c.environment,
                settings: c.settings || {},
                address: {
                    streetName: c.street_name || c.address || '',
                    buildingNumber: c.building_number || '',
                    cityName: c.city || '',
                    citySubdivisionName: c.city_subdivision || '',
                    postalZone: c.postal_zone || '',
                    countryCode: c.country || 'SA'
                }
            }]
        }));

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('x-isolation-status', 'active-v2');
        res.setHeader('x-debug-role', userRole || 'NONE');
        res.setHeader('x-debug-email', userEmail || 'NONE');
        res.json(organizations);
    } catch (error: any) {
        console.error('Error fetching companies:', error);
        res.status(500).json({ error: 'Failed to fetch companies', details: error?.message || String(error) });
    }
});

/**
 * @swagger
 * /api/admin/companies:
 *   post:
 *     summary: Create a new company
 *     description: Register a new company and assign it to a group if provided.
 *     tags: [Admin - Companies]
 *     parameters:
 *       - in: header
 *         name: x-user-role
 *         required: true
 *         schema:
 *           type: string
 *           default: SUPER_ADMIN
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, vatNumber]
 *             properties:
 *               name: { type: string }
 *               vatNumber: { type: string }
 *               crNumber: { type: string }
 *               branchName: { type: string }
 *               address: { type: string }
 *               city: { type: string }
 *               country: { type: string }
 *               groupId: { type: integer }
 *     responses:
 *       200:
 *         description: Company created successfully
 *       500:
 *         description: Failed to create company
 */
router.post('/companies', requireSuperAdmin, async (req, res) => {
    try {
        const { name, vatNumber, crNumber, branchName, address, city, country, groupId, ownerId } = req.body;

        const defaultUserId = 'system_admin';
        const finalOwnerId = ownerId || defaultUserId;
        
        // Ensure the owner exists
        try {
            const owner = await prisma.user.findUnique({ where: { id: finalOwnerId } });
            if (!owner && finalOwnerId === defaultUserId) {
                // Create default user if it's the target and missing
                await prisma.user.upsert({
                    where: { id: defaultUserId },
                    update: {},
                    create: {
                        id: defaultUserId,
                        email: 'admin@system.local',
                        role: 'SUPER_ADMIN',
                        password: encrypt('Zatca#Secure!2026@Connect')
                    }
                });
            } else if (!owner) {
                return res.status(404).json({ error: `Owner user with ID ${finalOwnerId} not found` });
            }
        } catch (uErr: any) {
            console.error('[Admin] Error verifying owner exists:', uErr.message);
        }

        const newCompany = await prisma.company.create({
            data: {
                user_id: finalOwnerId,
                group_id: groupId ? parseInt(groupId) : null,
                registered_name: name,
                vat_number: vatNumber,
                cr_number: crNumber,
                branch_name: cleanBranchName(branchName),
                address: address || '',
                city: city || '',
                country: country || 'SA',
                environment: 'SANDBOX',
                settings: {}
            },
            include: { group: true }
        });

        // Return in the format App.tsx expects for Organization
        res.json({
            id: newCompany.id.toString(),
            name: newCompany.registered_name,
            vatNumber: newCompany.vat_number,
            crNumber: newCompany.cr_number,
            groupName: newCompany.group?.name || 'Unassigned',
            branches: [{
                id: `br-${newCompany.id}`,
                organizationId: newCompany.id.toString(),
                name: cleanBranchName(newCompany.branch_name),
                type: 'HQ',
                environment: newCompany.environment,
                settings: newCompany.settings || {},
                address: {
                    streetName: newCompany.address || '',
                    buildingNumber: '',
                    cityName: newCompany.city || '',
                    postalZone: '',
                    countryCode: newCompany.country || 'SA'
                }
            }]
        });

    } catch (error: any) {
        console.error('[Admin] Error creating company:', error.message);
        res.status(500).json({ error: `Failed to create company: ${error.message}` });
    }
});

// PUT /api/admin/companies/:id - Update company detail
router.put('/companies/:id', requireAnyAdmin, async (req, res) => {
    console.log(`[Admin] PUT request for company ID: ${req.params.id}`);
    try {
        const { id } = req.params;
        const companyId = parseInt(id);
        const { name, vatNumber, crNumber, address, city, country, branchName, environment, settings, buildingNumber, streetName, citySubdivisionName, postalZone } = req.body;
        console.log(`[Admin] Updating company ${companyId} with:`, { name, vatNumber, environment });

        const updateData: any = {
            registered_name: name,
            vat_number: vatNumber,
            cr_number: crNumber,
            address: address || '',
            city: city || '',
            country: country || 'SA',
            building_number: buildingNumber || null,
            street_name: streetName || null,
            city_subdivision: citySubdivisionName || null,
            postal_zone: postalZone || null,
            branch_name: cleanBranchName(branchName)
        };

        if (environment) {
            updateData.environment = environment.toUpperCase();
        }
        
        if (settings) {
            updateData.settings = settings;
        }

        const updatedCompany = await prisma.company.update({
            where: { id: companyId },
            data: updateData
        });

        res.json({
            id: updatedCompany.id.toString(),
            name: updatedCompany.registered_name,
            message: 'Company updated successfully'
        });
    } catch (error: any) {
        console.error('[Admin] Error updating company:', error.message);
        res.status(500).json({ error: `Failed to update company: ${error.message}` });
    }
});

// DELETE /api/admin/companies/:id - Delete company
router.delete('/companies/:id', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = parseInt(id);

        const now = new Date();
        
        // Soft delete related records
        await (prisma.invoice as any).updateMany({ 
            where: { company_id: companyId }, 
            data: { is_deleted: true, deleted_at: now } 
        });
        await (prisma.certificate as any).updateMany({ 
            where: { company_id: companyId }, 
            data: { is_active: false, is_deleted: true, deleted_at: now } 
        });
        await (prisma.customer as any).updateMany({ 
            where: { company_id: companyId }, 
            data: { is_deleted: true, deleted_at: now } 
        });
        await (prisma.erp_configuration as any).updateMany({ 
            where: { company_id: companyId }, 
            data: { is_active: false, is_deleted: true, deleted_at: now } 
        });
        await (prisma.item as any).updateMany({ 
            where: { company_id: companyId }, 
            data: { is_deleted: true, deleted_at: now } 
        });
        
        await (prisma.company as any).update({
            where: { id: companyId },
            data: { 
                is_active: false, 
                is_deleted: true, 
                deleted_at: now 
            }
        });

        res.json({ message: 'Company and related records soft-deleted successfully' });
    } catch (error: any) {
        console.error('Error soft-deleting company:', error);
        res.status(500).json({ error: `Failed to soft-delete company: ${error.message}` });
    }
});

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: List all users
 *     tags: [Admin - Users]
 *     parameters:
 *       - in: header
 *         name: x-user-role
 *         required: true
 *         schema:
 *           type: string
 *           default: SUPER_ADMIN
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/users', requireSuperAdmin, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            orderBy: { created_at: 'desc' }
        });
        // Exclude password from response
        const safeUsers = users.map(u => ({
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
            companyName: u.company_name,
            createdAt: u.created_at
        }));
        res.json(safeUsers);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// POST /api/admin/users - Create new user
router.post('/users', requireSuperAdmin, async (req, res) => {
    console.log('[Admin] Received user creation request for:', req.body.email);
    try {
        const { email, password, name, role, companyName } = req.body;

        if (!email || !password || !role) {
            console.warn('[Admin] Missing required fields for user creation');
            return res.status(400).json({ error: 'Email, password, and role are required' });
        }

        const allowedDomains = ['easylease.ae', 'easylease.com.sa', 'easylease.com', 'sakytek.com', 'tech-solutions.sa', 'system.local'];
        const userDomain = email.toLowerCase().split('@')[1];
        if (!userDomain || !allowedDomains.includes(userDomain)) {
            console.warn(`[Admin] Rejected user creation with disallowed domain: ${email}`);
            return res.status(400).json({
                error: 'Access Denied: Only EasyLease domain users (@easylease.ae, @easylease.com.sa, @easylease.com) are allowed.'
            });
        }

        // Test connection before creating
        try {
            await prisma.$connect();
        } catch (connErr: any) {
            console.error('[Admin] Database connection failed during user creation:', connErr.message);
            return res.status(503).json({ error: 'Database connection unavailable. Please try again in 30 seconds.' });
        }

        const newUser = await prisma.user.create({
            data: {
                id: crypto.randomUUID(),
                email,
                password: encrypt(password), 
                name,
                role: role, 
                company_name: companyName
            }
        });

        // Sync ownership if company name is provided
        if (companyName) {
            try {
                const targetCompany = await prisma.company.findFirst({
                    where: { registered_name: companyName }
                });
                if (targetCompany) {
                    await prisma.company.update({
                        where: { id: targetCompany.id },
                        data: { user_id: newUser.id }
                    });
                    console.log(`[Admin] Synchronized ownership for company "${companyName}" to user ${newUser.id}`);
                }
            } catch (syncErr: any) {
                console.error('[Admin] Failed to sync company ownership:', syncErr.message);
            }
        }

        console.log('[Admin] User created successfully:', newUser.id);
        res.json({
            id: newUser.id,
            email: newUser.email,
            message: 'User created successfully'
        });

    } catch (error: any) {
        console.error('[Admin] Error creating user detail:', {
            message: error.message,
            code: error.code,
            meta: error.meta
        });
        
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'User with this email already exists' });
        }
        
        res.status(500).json({ error: `Failed to create user: ${error.message}` });
    }
});

// POST /api/admin/users/:id/reset-password
router.post('/users/:id/reset-password', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;

        if (!newPassword) {
            return res.status(400).json({ error: 'New password is required' });
        }

        await prisma.user.update({
            where: { id },
            data: { password: encrypt(newPassword) } 
        });

        res.json({ message: 'Password reset successfully' });

    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// DELETE /api/admin/users/:id - Delete user
router.delete('/users/:id', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Prevent deleting the last Super Admin (optional safety check)
        const user = await prisma.user.findUnique({ where: { id } });
        if (user?.role === 'SUPER_ADMIN') {
            const superAdminCount = await prisma.user.count({ where: { role: 'SUPER_ADMIN' } });
            if (superAdminCount <= 1) {
                return res.status(400).json({ error: 'Cannot delete the last Super Admin' });
            }
        }

        // Before deleting, re-assign any companies owned by this user to 'system_admin'
        // to avoid foreign key constraint violations
        await prisma.company.updateMany({
            where: { user_id: id },
            data: { user_id: 'system_admin' }
        });

        await prisma.user.delete({ where: { id } });
        res.json({ message: 'User deleted successfully' });
    } catch (error: any) {
        console.error('Error deleting user:', error);
        res.status(500).json({ 
            error: 'Failed to delete user', 
            details: error.message 
        });
    }
});

// ALL /api/admin/system/deploy-pull - Pull latest code on VPS host
router.all('/system/deploy-pull', requireSuperAdmin, (req, res) => {
    // exec already imported at top of file
    exec('git pull origin master', (err: any, stdout: string, stderr: string) => {
        if (err) {
            console.error('[Deploy Pull] Error:', err);
            return res.status(500).json({ error: err.message, stderr });
        }
        console.log('[Deploy Pull] Success:', stdout);
        res.json({ message: 'Git pull successful', stdout });
    });
});

// POST /api/admin/system/update-env - Update environment variables (e.g. DATABASE_URL)
router.post('/system/update-env', requireSuperAdmin, async (req, res) => {
    try {
        const { databaseUrl } = req.body;
        if (!databaseUrl) {
            return res.status(400).json({ error: 'databaseUrl is required' });
        }
        
        const envPath = path.join(process.cwd(), '.env');
        let envContent = '';
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf-8');
        }

        if (envContent.includes('DATABASE_URL=')) {
            envContent = envContent.replace(/DATABASE_URL=".*?"/g, `DATABASE_URL="${databaseUrl}"`);
            envContent = envContent.replace(/DATABASE_URL='.*?'/g, `DATABASE_URL="${databaseUrl}"`);
            envContent = envContent.replace(/DATABASE_URL=[^\r\n]+/g, `DATABASE_URL="${databaseUrl}"`);
        } else {
            envContent += `\nDATABASE_URL="${databaseUrl}"\n`;
        }

        fs.writeFileSync(envPath, envContent, 'utf-8');
        process.env.DATABASE_URL = databaseUrl;

        // Restart PM2 process if pm2 is available
        // exec already imported at top of file
        exec('pm2 restart all || pm2 restart zatca-backend', (err: any, stdout: string) => {
            console.log('[Update Env] PM2 restart output:', stdout);
        });

        res.json({ message: 'DATABASE_URL updated successfully and PM2 restart triggered' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;



