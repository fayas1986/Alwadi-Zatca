
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const router = Router();
const prisma = new PrismaClient();

// Middleware to simulate Role Check (In real app, verify JWT/Session)
const requireSuperAdmin = (req: any, res: any, next: any) => {
    const userRole = req.headers['x-user-role'];
    // For now, we trust the header for demo purposes or if simple auth
    if (userRole !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Access Denied: Super Admin only' });
    }
    next();
};

// GET /api/admin/companies - List all companies
router.get('/companies', requireSuperAdmin, async (req, res) => {
    try {
        const companies = await prisma.company.findMany({
            include: {
                user: true,
                certificates: true
            }
        });
        
        // Map to frontend Organization structure if needed, or return as is
        // Frontend expects: { id, name, vatNumber, crNumber, branches: [...] }
        // Backend has: { id, registered_name, vat_number, cr_number, branch_name }
        
        const organizations = companies.map(c => ({
            id: c.id.toString(),
            name: c.registered_name,
            vatNumber: c.vat_number,
            crNumber: c.cr_number,
            branches: [{
                id: `br-${c.id}`,
                organizationId: c.id.toString(),
                name: c.branch_name || 'Main Branch',
                type: 'HQ',
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
        const { name, vatNumber, crNumber, branchName, address, city, country } = req.body;

        // In this simple schema, a company needs a user. 
        // We'll assign it to a default admin user or create one if not provided.
        // For this demo, let's assume a "system_admin" user exists or we create a placeholder.
        
        const defaultUserId = 'system_admin';
        
        // Ensure default user exists
        await prisma.user.upsert({
            where: { id: defaultUserId },
            update: {},
            create: {
                id: defaultUserId,
                email: 'admin@system.local',
                role: 'SUPER_ADMIN'
            }
        });

        const newCompany = await prisma.company.create({
            data: {
                user_id: defaultUserId,
                registered_name: name,
                vat_number: vatNumber,
                cr_number: crNumber,
                branch_name: branchName || 'HQ',
                address,
                city,
                country: country || 'SA',
                environment: 'SANDBOX'
            }
        });

        res.json({
            id: newCompany.id.toString(),
            name: newCompany.registered_name,
            vatNumber: newCompany.vat_number,
            message: 'Company created successfully'
        });

    } catch (error) {
        console.error('Error creating company:', error);
        res.status(500).json({ error: 'Failed to create company' });
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
    try {
        const { email, password, name, role, companyName } = req.body;

        if (!email || !password || !role) {
            return res.status(400).json({ error: 'Email, password, and role are required' });
        }

        const newUser = await prisma.user.create({
            data: {
                id: crypto.randomUUID(),
                email,
                password, // In real app, HASH THIS!
                name,
                role: role, 
                company_name: companyName
            }
        });

        res.json({
            id: newUser.id,
            email: newUser.email,
            message: 'User created successfully'
        });

    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user. Email might already exist.' });
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
            data: { password: newPassword } // In real app, HASH THIS!
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
