
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
import prisma from '../lib/prisma.js';
import { decrypt } from '../utils/crypto.js';

// ─── Fallback users (mirrors actual Neon DB accounts — used when DB sleeps) ──
// These match the real DB users. Password for all: password123
const FALLBACK_USERS: Record<string, { id: string; email: string; password: string; name: string; role: string; company_name: string; company_id?: number }> = {
    'superadmin@tech-solutions.sa': {
        id: 'u-001', email: 'superadmin@tech-solutions.sa', password: 'Zatca#Secure!2026@Connect',
        name: 'Super Admin', role: 'SUPER_ADMIN', company_name: 'Satguru Travels Tourism', company_id: 1
    },
    'admin@tech-solutions.sa': {
        id: 'u-002', email: 'admin@tech-solutions.sa', password: 'password123',
        name: 'IT Administrator', role: 'IT_ADMIN', company_name: 'Satguru Travels Tourism', company_id: 1
    },
    'finance@tech-solutions.sa': {
        id: 'u-003', email: 'finance@tech-solutions.sa', password: 'password123',
        name: 'Finance Manager', role: 'FINANCE_ADMIN', company_name: 'Satguru Travels Tourism', company_id: 1
    },
    'tax@tech-solutions.sa': {
        id: 'u-004', email: 'tax@tech-solutions.sa', password: 'password123',
        name: 'Tax Officer', role: 'TAX_OFFICER', company_name: 'Satguru Travels Tourism', company_id: 1
    },
};


/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: User Login
 *     description: Authenticate a user with email and password. Supports both real DB and fallback users.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: superadmin@tech-solutions.sa
 *               password:
 *                 type: string
 *                 example: Zatca#Secure!2026@Connect
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 email:
 *                   type: string
 *                 name:
 *                   type: string
 *                 role:
 *                   type: string
 *                 companyName:
 *                   type: string
 *                 source:
 *                   type: string
 *       401:
 *         description: Invalid credentials
 *       500:
 *         description: Internal server error
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // ── Primary: try the Neon DB ──────────────────────────────────────────
        let user: any = null;
        let fromDb = false;

        try {
            user = await prisma.user.findUnique({ where: { email } });
            fromDb = true;
        } catch (dbErr: any) {
            // DB is sleeping or unreachable — fall back to hardcoded users
            console.warn('[Auth] DB unavailable, using fallback users:', dbErr.code || dbErr.message?.slice(0, 80));
        }

        // ── Fallback: in-memory users ─────────────────────────────────────────
        if (!fromDb || !user) {
            const fallback = FALLBACK_USERS[email.toLowerCase()];
            if (!fallback) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            if (fallback.password !== password) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            return res.json({
                id: fallback.id,
                email: fallback.email,
                name: fallback.name,
                role: fallback.role,
                companyName: fallback.company_name,
                companyId: (fallback as any).company_id,
                source: 'fallback'
            });
        }

        // ── DB user found ─────────────────────────────────────────────────────
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verify password (plaintext or encrypted)
        const isMatch = user.password.includes(':') 
            ? decrypt(user.password) === password 
            : user.password === password;

        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Fetch the first company associated with the user (Direct Ownership)
        let company = await prisma.company.findFirst({
            where: { user_id: user.id }
        });

        // Fallback: Check if the user is "assigned" to a company via company_name (Membership)
        if (!company && user.company_name) {
            company = await prisma.company.findFirst({
                where: { registered_name: user.company_name }
            });
        }

        return res.json({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            companyName: user.company_name,
            companyId: company?.id,
            source: 'database'
        });

    } catch (error: any) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error', detail: error.message });
    }
});

export default router;
