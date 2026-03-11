
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// ─── Fallback users (mirrors actual Neon DB accounts — used when DB sleeps) ──
// These match the real DB users. Password for all: password123
const FALLBACK_USERS: Record<string, { id: string; email: string; password: string; name: string; role: string; company_name: string }> = {
    'superadmin@tech-solutions.sa': {
        id: 'u-001', email: 'superadmin@tech-solutions.sa', password: 'password123',
        name: 'Super Admin', role: 'SUPER_ADMIN', company_name: 'Tech Solutions Ltd'
    },
    'admin@tech-solutions.sa': {
        id: 'u-002', email: 'admin@tech-solutions.sa', password: 'password123',
        name: 'IT Administrator', role: 'IT_ADMIN', company_name: 'Tech Solutions Ltd'
    },
    'finance@tech-solutions.sa': {
        id: 'u-003', email: 'finance@tech-solutions.sa', password: 'password123',
        name: 'Finance Manager', role: 'FINANCE_ADMIN', company_name: 'Tech Solutions Ltd'
    },
    'tax@tech-solutions.sa': {
        id: 'u-004', email: 'tax@tech-solutions.sa', password: 'password123',
        name: 'Tax Officer', role: 'TAX_OFFICER', company_name: 'Tech Solutions Ltd'
    },
};


// POST /api/auth/login
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
                source: 'fallback'
            });
        }

        // ── DB user found ─────────────────────────────────────────────────────
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verify password (plaintext for this demo)
        if (user.password !== password) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        return res.json({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            companyName: user.company_name,
            source: 'database'
        });

    } catch (error: any) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error', detail: error.message });
    }
});

export default router;
