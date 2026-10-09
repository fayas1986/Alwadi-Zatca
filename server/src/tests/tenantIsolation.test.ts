import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import apiV2Router from '../routes/api_v2.js';
import prisma from '../lib/prisma.js';

// Mock dependencies
vi.mock('../lib/prisma.js', () => ({
    default: {
        erp_configuration: {
            findFirst: vi.fn(),
            findMany: vi.fn()
        },
        company: {
            findFirst: vi.fn(),
            findUnique: vi.fn()
        },
        invoice: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn()
        },
        certificate: {
            findFirst: vi.fn(),
            findMany: vi.fn()
        },
        audit_log: {
            create: vi.fn(),
            findMany: vi.fn()
        }
    }
}));

const app = express();
app.use(express.json());
app.use('/api/v2', apiV2Router);

describe('Tenant & Company Isolation Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should reject requests with missing or invalid x-api-key (fail-closed)', async () => {
        const res = await request(app)
            .get('/api/v2/erp/status/550e8400-e29b-41d4-a716-446655440000')
            .set('x-api-key', 'invalid_key_123');

        expect(res.status).toBe(401);
        expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('should enforce tenant boundary and scope status lookup to requesting company', async () => {
        const tenantACompany = { id: 10, registered_name: 'Tenant A', vat_number: '300000000000003', is_active: true };
        const tenantAConfig = { id: 'cfg-a', api_key: 'sk_tenant_a_key', is_active: true, company: tenantACompany };

        vi.mocked(prisma.erp_configuration.findFirst).mockImplementation(async (args: any) => {
            if (args?.where?.api_key === 'sk_tenant_a_key') {
                return tenantAConfig as any;
            }
            return null;
        });

        // Mock invoice search scoped strictly by company_id
        vi.mocked(prisma.invoice.findFirst).mockImplementation(async (args: any) => {
            if (args?.where?.company_id === 10 && args?.where?.OR) {
                return {
                    id: 101,
                    uuid: '550e8400-e29b-41d4-a716-446655440000',
                    company_id: 10,
                    status: 'CLEARED',
                    invoice_number: 'INV-A-001',
                    created_at: new Date(),
                    metadata: {}
                } as any;
            }
            return null;
        });

        const res = await request(app)
            .get('/api/v2/erp/status/550e8400-e29b-41d4-a716-446655440000')
            .set('x-api-key', 'sk_tenant_a_key');

        expect(res.status).toBe(200);
        expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    company_id: 10
                })
            })
        );
    });

    it('should fail closed (404 NOT_FOUND) when Tenant A attempts to access an invoice belonging to Tenant B', async () => {
        const tenantACompany = { id: 10, registered_name: 'Tenant A', vat_number: '300000000000003', is_active: true };
        const tenantAConfig = { id: 'cfg-a', api_key: 'sk_tenant_a_key', is_active: true, company: tenantACompany };

        vi.mocked(prisma.erp_configuration.findFirst).mockResolvedValue(tenantAConfig as any);

        // Invoice 550e8400-e29b-41d4-a716-446655449999 belongs to Tenant B (company_id: 20)
        vi.mocked(prisma.invoice.findFirst).mockImplementation(async (args: any) => {
            // Because company_id filter (10) does not match Tenant B (20), prisma returns null
            return null;
        });

        const res = await request(app)
            .get('/api/v2/erp/status/550e8400-e29b-41d4-a716-446655449999')
            .set('x-api-key', 'sk_tenant_a_key');

        expect(res.status).toBe(404);
        expect(res.body.code).toBe('NOT_FOUND');
    });
});
