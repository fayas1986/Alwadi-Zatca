import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import zatcaRouter from '../routes/zatca.js';
import erpRouter from '../routes/erp.js';
import { SecurityService } from '../services/securityService.js';

// Mock dependencies to avoid actual database/network calls
vi.mock('../lib/prisma.js', () => ({
    default: {
        company: {
            findUnique: vi.fn().mockResolvedValue({ id: 1 })
        },
        certificate: {
            findMany: vi.fn().mockResolvedValue([])
        },
        erp_configuration: {
            findMany: vi.fn().mockResolvedValue([])
        }
    }
}));

vi.mock('../services/securityService.js', () => ({
    SecurityService: {
        authenticateRequest: vi.fn((req, res, next) => next()),
        verifySignature: vi.fn().mockResolvedValue(true)
    }
}));

const app = express();
app.use(express.json());
// Mock authenticateHMAC middleware for ERP routes
vi.mock('../routes/api_v1.js', () => ({
    authenticateHMAC: (req: any, res: any, next: any) => next()
}));

app.use('/api/zatca', zatcaRouter);
app.use('/api/erp', erpRouter);

// Global error handler to catch our specific crash
app.use((err: any, req: any, res: any, next: any) => {
    res.status(500).json({ error: err.message, name: err.name });
});

describe('companyId Type Safety', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should not crash with TypeError when companyId is passed as an array to ZATCA certificates', async () => {
        const res = await request(app)
            .get('/api/zatca/certificates?companyId=123&companyId=456');
        
        expect(res.status).not.toBe(500);
        expect(res.body?.name).not.toBe('TypeError');
    });

    it('should not crash with TypeError when companyId is passed as an array to ERP config', async () => {
        const res = await request(app)
            .get('/api/erp/configs?companyId=123&companyId=456');
        
        expect(res.status).not.toBe(500);
        expect(res.body?.name).not.toBe('TypeError');
    });
});
