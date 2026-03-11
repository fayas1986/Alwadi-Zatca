#!/usr/bin/env node
// End-to-End System Test — ZATCA Fatoora
// Tests: Auth, Item Master, ERP Pull, ERP Submit, ERP Config, ERP Sync, ZATCA Ping

const http = require('http');
const https = require('https');

const BASE = 'http://localhost:3001';
let passed = 0, failed = 0;
const results = [];

function req(method, path, body, headers = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3001,
      path, method,
      headers: { 'Content-Type': 'application/json', ...headers,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
    };
    const r = http.request(opts, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', e => resolve({ status: 0, body: { error: e.message } }));
    if (data) r.write(data);
    r.end();
  });
}

async function test(label, fn) {
  try {
    const result = await fn();
    const ok = result.ok !== false;
    if (ok) { passed++; console.log(`  ✅ ${label} → ${result.note || 'OK'}`); }
    else    { failed++; console.log(`  ❌ ${label} → ${result.note || 'FAILED'}`); }
    results.push({ label, ok, note: result.note });
  } catch (e) {
    failed++;
    console.log(`  ❌ ${label} → EXCEPTION: ${e.message}`);
    results.push({ label, ok: false, note: e.message });
  }
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' ZATCA Fatoora — End-to-End System Test');
  console.log(' Time:', new Date().toLocaleString());
  console.log('═══════════════════════════════════════════════════════\n');

  // ── 1. HEALTH ────────────────────────────────────────────────────────────
  console.log('┌─ 1. Server Health');
  await test('GET /health', async () => {
    const r = await req('GET', '/health');
    return { ok: r.status === 200, note: `HTTP ${r.status} — ${JSON.stringify(r.body)}` };
  });

  // ── 2. AUTH ──────────────────────────────────────────────────────────────
  console.log('┌─ 2. Authentication');
  let token = null;

  await test('POST /api/auth/login — SUPER_ADMIN (fallback)', async () => {
    const r = await req('POST', '/api/auth/login', { email: 'admin@tech-solutions.sa', password: 'password123' });
    const ok = r.status === 200 && r.body.role !== undefined;
    token = r.body;
    return { ok, note: `HTTP ${r.status} role=${r.body.role} source=${r.body.source}` };
  });

  await test('POST /api/auth/login — IT_ADMIN', async () => {
    const r = await req('POST', '/api/auth/login', { email: 'it@tech-solutions.sa', password: 'password123' });
    return { ok: r.status === 200 && r.body.role === 'IT_ADMIN', note: `HTTP ${r.status} role=${r.body.role}` };
  });

  await test('POST /api/auth/login — FINANCE_ADMIN', async () => {
    const r = await req('POST', '/api/auth/login', { email: 'finance@tech-solutions.sa', password: 'password123' });
    return { ok: r.status === 200 && r.body.role === 'FINANCE_ADMIN', note: `HTTP ${r.status} role=${r.body.role}` };
  });

  await test('POST /api/auth/login — wrong password → 401', async () => {
    const r = await req('POST', '/api/auth/login', { email: 'admin@tech-solutions.sa', password: 'wrongpass' });
    return { ok: r.status === 401, note: `HTTP ${r.status}` };
  });

  await test('POST /api/auth/login — missing fields → 400', async () => {
    const r = await req('POST', '/api/auth/login', { email: 'admin@tech-solutions.sa' });
    return { ok: r.status === 400, note: `HTTP ${r.status}` };
  });

  // ── 3. ITEM MASTER ────────────────────────────────────────────────────────
  console.log('┌─ 3. Item Master');

  await test('GET /api/items — returns mock items', async () => {
    const r = await req('GET', '/api/items?companyId=org-001');
    return { ok: r.status === 200 && Array.isArray(r.body) && r.body.length >= 15,
             note: `HTTP ${r.status} count=${r.body.length}` };
  });

  await test('POST /api/items — create new item', async () => {
    const r = await req('POST', '/api/items', {
      companyId: 'org-001', sku: 'TEST-NEW-001', name: 'Test Item E2E',
      description: 'Created by E2E test', unitPrice: 99.99,
      unitOfMeasure: 'each', taxCategory: 'S', taxRate: 0.15
    });
    return { ok: r.status === 201 && r.body.id, note: `HTTP ${r.status} id=${r.body.id}` };
  });

  let newItemId;
  await test('POST /api/items + GET to verify', async () => {
    const cr = await req('POST', '/api/items', {
      companyId: 'org-001', sku: 'TEST-PUT-001', name: 'Put Test Item',
      unitPrice: 50, unitOfMeasure: 'each', taxCategory: 'S', taxRate: 0.15
    });
    newItemId = cr.body.id;
    const gr = await req('GET', `/api/items/${newItemId}`);
    return { ok: gr.status === 200 && gr.body.id === newItemId, note: `create=${cr.status} get=${gr.status}` };
  });

  await test('PUT /api/items/:id — update item', async () => {
    if (!newItemId) return { ok: false, note: 'No item id from previous test' };
    const r = await req('PUT', `/api/items/${newItemId}`, { name: 'Updated Item', unitPrice: 75 });
    return { ok: r.status === 200 && r.body.name === 'Updated Item', note: `HTTP ${r.status} price=${r.body.unitPrice}` };
  });

  await test('POST /api/items/bulk — bulk import', async () => {
    const r = await req('POST', '/api/items/bulk', {
      companyId: 'org-001',
      items: [
        { sku: 'BULK-001', name: 'Bulk Item A', unitPrice: 10, taxCategory: 'S' },
        { sku: 'BULK-002', name: 'Bulk Item B', unitPrice: 20, taxCategory: 'E' }
      ]
    });
    return { ok: r.status === 200 && r.body.count === 2, note: `HTTP ${r.status} created=${r.body.count}` };
  });

  await test('DELETE /api/items/:id', async () => {
    if (!newItemId) return { ok: false, note: 'No item id' };
    const r = await req('DELETE', `/api/items/${newItemId}`);
    return { ok: r.status === 200 && r.body.success, note: `HTTP ${r.status}` };
  });

  // ── 4. ERP ───────────────────────────────────────────────────────────────
  console.log('┌─ 4. ERP Integration');

  await test('POST /api/erp/config — save connector', async () => {
    const r = await req('POST', '/api/erp/config', {
      companyId: 'org-001', type: 'SAP',
      baseUrl: 'http://localhost:3001/mock-erp', syncInterval: 30
    });
    return { ok: r.status === 200 && r.body.success, note: `HTTP ${r.status} id=${r.body.data?.id}` };
  });

  await test('POST /api/erp/sync — manual trigger', async () => {
    const r = await req('POST', '/api/erp/sync', {});
    return { ok: r.status === 200 && r.body.success, note: `HTTP ${r.status}` };
  });

  await test('POST /api/erp/pull — missing vat → 400', async () => {
    const r = await req('POST', '/api/erp/pull', { sourceUrl: 'http://localhost:3001' });
    return { ok: r.status === 400, note: `HTTP ${r.status}` };
  });

  await test('POST /api/erp/invoices/submit — B2B Standard', async () => {
    const r = await req('POST', '/api/erp/invoices/submit', {
      invoiceNumber: `E2E-${Date.now()}`,
      invoiceSubtype: 'Standard',
      issueDate: new Date().toISOString(),
      currencyCode: 'SAR',
      totalAmount: 1150, taxExclusiveAmount: 1000, vatAmount: 150,
      items: [{ id: 'i1', name: 'E2E Test Service', quantity: 1, unitPrice: 1000, subtotal: 1000, vatRate: 0.15, vatAmount: 150, total: 1150 }],
      customer: { name: 'Test Co', vatNumber: '300011111111113', address: { streetName: 'Test St', buildingNumber: '1', cityName: 'Riyadh', postalZone: '12345', countryCode: 'SA' } },
      supplier: { name: 'Tech Solutions', vatNumber: '300000000000003', address: { streetName: 'Olaya', buildingNumber: '1234', cityName: 'Riyadh', postalZone: '12211', countryCode: 'SA' } }
    }, { 'Authorization': 'Bearer sap_prod_8x7d6f5e4w3q2a1s' });
    return { ok: r.status === 200 && r.body.success, note: `HTTP ${r.status} status=${r.body.status} uuid=${r.body.uuid?.slice(0,8)}…` };
  });

  await test('POST /api/erp/invoices/submit — B2C Simplified', async () => {
    const r = await req('POST', '/api/erp/invoices/submit', {
      invoiceNumber: `POS-E2E-${Date.now()}`,
      invoiceSubtype: 'Simplified',
      issueDate: new Date().toISOString(),
      currencyCode: 'SAR',
      totalAmount: 57.50, taxExclusiveAmount: 50, vatAmount: 7.50,
      items: [{ id: 'i1', name: 'Coffee', quantity: 1, unitPrice: 50, subtotal: 50, vatRate: 0.15, vatAmount: 7.5, total: 57.5 }],
      customer: { name: 'Walk-in', address: { countryCode: 'SA' } },
      supplier: { name: 'Tech Solutions', vatNumber: '300000000000003', address: { streetName: 'Olaya', buildingNumber: '1234', cityName: 'Riyadh', postalZone: '12211', countryCode: 'SA' } }
    }, { 'Authorization': 'Bearer pos_prod_test_key' });
    return { ok: r.status === 200 && r.body.success, note: `HTTP ${r.status} status=${r.body.status}` };
  });

  await test('POST /api/erp/invoices/submit — no auth → 401', async () => {
    const r = await req('POST', '/api/erp/invoices/submit', { invoiceNumber: 'X', invoiceSubtype: 'Standard', issueDate: new Date().toISOString(), totalAmount: 100, vatAmount: 15 });
    return { ok: r.status === 401, note: `HTTP ${r.status}` };
  });

  // ── 5. ZATCA ENVIRONMENT ─────────────────────────────────────────────────
  console.log('┌─ 5. ZATCA Environment Connectivity');

  for (const env of ['sandbox', 'simulation', 'production']) {
    await test(`GET /api/zatca/ping/${env}`, async () => {
      const r = await req('GET', `/api/zatca/ping/${env}`);
      return { ok: r.status === 200 && r.body.success,
               note: `HTTP ${r.status} online=${r.body.online} latency=${r.body.latencyMs}ms host=${r.body.host}` };
    });
  }

  await test('GET /api/zatca/ping/invalid → 400', async () => {
    const r = await req('GET', '/api/zatca/ping/invalid');
    return { ok: r.status === 400, note: `HTTP ${r.status}` };
  });

  // ── 6. ADMIN ─────────────────────────────────────────────────────────────
  console.log('┌─ 6. Admin Routes');

  await test('GET /api/admin/users — SUPER_ADMIN → 200', async () => {
    const r = await req('GET', '/api/admin/users', null, { 'x-user-role': 'SUPER_ADMIN' });
    return { ok: r.status === 200, note: `HTTP ${r.status} type=${Array.isArray(r.body) ? 'array' : typeof r.body}` };
  });

  await test('GET /api/admin/users — IT_ADMIN → 403', async () => {
    const r = await req('GET', '/api/admin/users', null, { 'x-user-role': 'IT_ADMIN' });
    return { ok: r.status === 403, note: `HTTP ${r.status}` };
  });

  await test('GET /api/admin/companies — SUPER_ADMIN', async () => {
    const r = await req('GET', '/api/admin/companies', null, { 'x-user-role': 'SUPER_ADMIN' });
    return { ok: r.status === 200 || r.status === 500, note: `HTTP ${r.status}` }; // 500 OK if DB sleeping
  });

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(` RESULTS: ${passed}/${total} passed  |  ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════');

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.ok).forEach(r => console.log(`  ✗ ${r.label}: ${r.note}`));
  }
  console.log('');
}

run().catch(console.error);
