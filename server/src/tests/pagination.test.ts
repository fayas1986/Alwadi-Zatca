import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';
import { fetchAndProcessInvoices } from '../services/integrationService.js';
import prisma from '../lib/prisma.js';
import { SecurityService } from '../services/securityService.js';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as any;

// Mock prisma
vi.mock('../lib/prisma.js', () => ({
    default: {
        company: {
            findUnique: vi.fn()
        },
        invoice: {
            findFirst: vi.fn(),
            create: vi.fn()
        },
        erp_configuration: {
            findMany: vi.fn().mockResolvedValue([])
        }
    }
}));

// Mock SecurityService
vi.mock('../services/securityService.js', () => ({
    SecurityService: {
        decrypt: vi.fn((val) => val)
    }
}));

// Mock sdkService
vi.mock('../services/sdkService.js', () => ({
    signInvoice: vi.fn().mockResolvedValue({ signedXml: 'signed', hash: 'hash', qr: 'qr' })
}));

// Mock xmlService
vi.mock('../services/xmlService.js', () => ({
    generateInvoiceXML: vi.fn().mockReturnValue('<xml></xml>')
}));

// Mock zatcaService
vi.mock('../services/zatcaService.js', () => ({
    reportInvoice: vi.fn().mockResolvedValue({ reportingStatus: 'REPORTED' }),
    clearInvoice: vi.fn().mockResolvedValue({ clearanceStatus: 'CLEARED' })
}));

describe('ERP Pagination Verification', () => {
    const vatNumber = '300000000000003';
    const sourceUrl = 'https://erp.example.com/api/invoices';
    
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should fetch multiple pages using "page" pagination', async () => {
        const companyMock = {
            id: 1,
            vat_number: vatNumber,
            registered_name: 'Test Co',
            certificates: [
                { is_active: true, type: 'SANDBOX', certificate: 'cert', private_key: 'key', secret: 'secret', csid: 'csid' }
            ]
        };
        (prisma.company.findUnique as any).mockResolvedValue(companyMock);
        (prisma.invoice.findFirst as any).mockResolvedValue(null); // No previous invoice

        // Page 1 response
        mockedAxios.get.mockResolvedValueOnce({
            data: {
                invoices: [{ invoiceNumber: 'INV001', issueDate: '2026-04-12', totalAmount: '100', vatAmount: '15', invoiceSubtype: 'Simplified' }]
            }
        });
        // Page 2 response
        mockedAxios.get.mockResolvedValueOnce({
            data: {
                invoices: [{ invoiceNumber: 'INV002', issueDate: '2026-04-12', totalAmount: '200', vatAmount: '30', invoiceSubtype: 'Simplified' }]
            }
        });
        // Page 3 empty (end)
        mockedAxios.get.mockResolvedValueOnce({
            data: { invoices: [] }
        });

        const pagination = {
            type: 'page',
            pageSize: 1,
            pageParam: 'page',
            limitParam: 'limit'
        };

        const results = await fetchAndProcessInvoices(sourceUrl, 'Bearer token', vatNumber, 'SANDBOX', pagination as any);

        expect(results).toHaveLength(2);
        expect(mockedAxios.get).toHaveBeenCalledTimes(3);
        expect(mockedAxios.get).toHaveBeenNthCalledWith(1, expect.stringContaining('page=1'), expect.anything());
        expect(mockedAxios.get).toHaveBeenNthCalledWith(2, expect.stringContaining('page=2'), expect.anything());
    });
});
