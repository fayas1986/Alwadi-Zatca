
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const router = Router();
console.log('[Admin] Admin routes initializing...');
import prisma from '../lib/prisma.js';
import { encrypt } from '../utils/crypto.js';

const requireSuperAdmin = (req: any, res: any, next: any) => {
    const userRole = req.headers['x-user-role'];
    if (userRole !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Access Denied: Super Admin only' });
    }
    next();
};

// GET /api/admin/groups - List all company groups
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


// GET /api/admin/companies - List all companies
router.get('/companies', requireSuperAdmin, async (req, res) => {
    try {
        const companies = await prisma.company.findMany({
            include: {
                user: true,
                certificates: true,
                group: true
            }
        });
        
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
                name: c.branch_name || 'Main Branch',
                type: 'HQ',
                environment: c.environment,
                settings: c.settings || {},
                address: {
                    streetName: c.address || '',
                    buildingNumber: '',
                    cityName: c.city || '',
                    postalZone: '',
                    countryCode: c.country || 'SA'
                }
            }]
        }));

        res.json(organizations);
    } catch (error) {
        console.error('Error fetching companies:', error);
        res.status(500).json({ error: 'Failed to fetch companies' });
    }
});

// POST /api/admin/companies - Create new company
router.post('/companies', requireSuperAdmin, async (req, res) => {
    try {
        const { name, vatNumber, crNumber, branchName, address, city, country, groupId } = req.body;

        const defaultUserId = 'system_admin';
        
        // Ensure default user exists
        try {
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
        } catch (uErr: any) {
            console.error('[Admin] Error ensuring system_admin exists:', uErr.message);
        }

        const newCompany = await prisma.company.create({
            data: {
                user_id: defaultUserId,
                group_id: groupId ? parseInt(groupId) : null,
                registered_name: name,
                vat_number: vatNumber,
                cr_number: crNumber,
                branch_name: branchName || 'HQ',
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
                name: newCompany.branch_name || 'Main Branch',
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
router.put('/companies/:id', requireSuperAdmin, async (req, res) => {
    console.log(`[Admin] PUT request for company ID: ${req.params.id}`);
    try {
        const { id } = req.params;
        const companyId = parseInt(id);
        const { name, vatNumber, crNumber, address, city, country, branchName, environment, settings } = req.body;
        console.log(`[Admin] Updating company ${companyId} with:`, { name, vatNumber, environment });

        const updateData: any = {
            registered_name: name,
            vat_number: vatNumber,
            cr_number: crNumber,
            address: address || '',
            city: city || '',
            country: country || 'SA',
            branch_name: branchName || 'HQ'
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

        // Delete related records first (cascade manually if not set in DB)
        await prisma.invoice.deleteMany({ where: { company_id: companyId } });
        await prisma.certificate.deleteMany({ where: { company_id: companyId } });
        await prisma.customer.deleteMany({ where: { company_id: companyId } });
        
        await prisma.company.delete({
            where: { id: companyId }
        });

        res.json({ message: 'Company deleted successfully' });
    } catch (error) {
        console.error('Error deleting company:', error);
        res.status(500).json({ error: 'Failed to delete company' });
    }
});

// GET /api/admin/users - List all users
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

        await prisma.user.delete({ where: { id } });
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

export default router;
