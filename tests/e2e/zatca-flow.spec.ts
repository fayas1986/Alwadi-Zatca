import { test, expect } from '@playwright/test';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:3001';
const FRONTEND_URL = 'http://localhost:5173';
const SIM_KEY = 'sk_sim_easylease_mock_v1';

function stableStringify(obj: any): string {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return '[' + obj.map(v => stableStringify(v)).join(',') + ']';
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => `"${k}":${stableStringify(obj[k])}`).join(',') + '}';
}

test.describe('ZatcaConnect E2E Compliance Flow', () => {

    test('IT Admin can authenticate and view KPI dashboard', async ({ page }) => {
        // Navigate to frontend login
        await page.goto(FRONTEND_URL);
        
        // Fill login credentials
        await page.locator('input[type="email"]').fill('admin@easylease.com');
        await page.locator('input[type="password"]').fill('password123');
        await page.locator('button[type="submit"]').click();

        // Expect navigation to root dashboard or header presence
        await expect(page.locator('header, h1, .dashboard-title')).toContainText(/ZATCA|Dashboard|EasyLease/i, { timeout: 10000 });
        
        // Verify KPI stat cards are present
        const kpiCards = page.locator('.stat-card, [data-testid="kpi-card"], .bg-white.p-6');
        await expect(kpiCards.first()).toBeVisible();
    });

    test('API Gateway rejects ERP invoice submission without valid HMAC signature', async ({ request }) => {
        const payload = {
            invoiceNumber: `INV-FAIL-${Date.now()}`,
            issueDate: new Date().toISOString().split('T')[0],
            invoiceType: "388",
            invoiceSubtype: "Standard",
            totalAmount: 115.00,
            taxAmount: 15.00,
            seller: { name: "EasyLease Transport", vatNumber: "300000000000003" },
            buyer: { name: "Test Customer", vatNumber: "311111111111113" },
            items: [{ name: "Logistics", quantity: 1, unitPrice: 100, taxRate: 15, taxAmount: 15, totalAmount: 115 }]
        };

        // Send request WITHOUT x-signature header
        const response = await request.post(`${BASE_URL}/api/erp/invoices/submit`, {
            headers: {
                'x-api-key': SIM_KEY,
                'x-timestamp': new Date().toISOString(),
                'x-nonce': Math.random().toString(36).substring(2, 10),
                'Content-Type': 'application/json'
            },
            data: payload
        });

        expect(response.status()).toBe(401);
        const body = await response.json();
        expect(body.message || JSON.stringify(body)).toMatch(/signature|unauthorized|missing/i);
    });

    test('API Gateway processes valid B2B invoice and returns ZATCA QR code', async ({ request }) => {
        const payload = {
            invoiceNumber: `INV-PASS-${Date.now()}`,
            issueDate: new Date().toISOString().split('T')[0],
            invoiceTime: "12:00:00",
            invoiceType: "388",
            invoiceSubtype: "Standard",
            currency: "SAR",
            totalAmount: 1150.00,
            taxAmount: 150.00,
            seller: {
                name: "EasyLease Transport",
                vatNumber: "300000000000003",
                address: { street: "Olaya St", city: "Riyadh", postalCode: "12211", country: "SA" }
            },
            buyer: {
                name: "Test Customer",
                vatNumber: "311111111111113",
                address: { street: "Tahlia St", city: "Jeddah", postalCode: "23322", country: "SA" }
            },
            items: [
                { name: "Heavy Equipment Lease", quantity: 1, unitPrice: 1000.00, taxRate: 15, taxAmount: 150.00, totalAmount: 1150.00 }
            ]
        };

        const timestamp = new Date().toISOString();
        const nonce = Math.random().toString(36).substring(2, 15);
        const method = 'POST';
        const path = '/api/erp/invoices/submit';
        
        // Calculate HMAC Signature
        const bodyHash = crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
        const dataToSign = `${timestamp}${nonce}${method}${path}${bodyHash}`;
        const signature = crypto.createHmac('sha256', SIM_KEY).update(dataToSign).digest('hex');

        const response = await request.post(`${BASE_URL}${path}`, {
            headers: {
                'x-api-key': SIM_KEY,
                'x-signature': signature,
                'x-timestamp': timestamp,
                'x-nonce': nonce,
                'Content-Type': 'application/json'
            },
            data: payload
        });

        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.status).toBe('CLEARED');
        expect(body.qrCode).toBeTruthy();
    });

});
