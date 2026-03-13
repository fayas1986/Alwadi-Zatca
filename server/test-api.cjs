/**
 * Custom REST API Integration Test
 * Tests all backend endpoints in real-time
 */
const http = require('http');

const BASE_URL = 'http://localhost:3001';
let passed = 0, failed = 0;

function request(method, path, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const options = {
            hostname: 'localhost',
            port: 3001,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
                ...headers
            }
        };
        const req = http.request(options, (res) => {
            let raw = '';
            res.on('data', chunk => raw += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                catch(e) { resolve({ status: res.statusCode, body: raw }); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

function test(name, fn) {
    return fn().then(r => {
        console.log(`  ✅ ${name} → ${r.status}`);
        passed++;
        return r;
    }).catch(e => {
        console.log(`  ❌ ${name} → ERROR: ${e.message}`);
        failed++;
    });
}

async function run() {
    console.log('\n========================================');
    console.log('  ZatcaConnect Custom REST API Test  ');
    console.log('========================================\n');

    // ── 1. Health Check ──────────────────────────────────────
    console.log('[ Health ]');
    await test('GET /health → 200', () => request('GET', '/health').then(r => {
        if (r.status !== 200) throw new Error(`Expected 200, got ${r.status}`);
        return r;
    }));

    // ── 2. Auth ──────────────────────────────────────────────
    console.log('\n[ Auth ]');
    let loginOk = false;
    await test('POST /api/auth/login (valid)', async () => {
        const r = await request('POST', '/api/auth/login', { email: 'admin@tech-solutions.sa', password: 'password' });
        if (r.status !== 200) throw new Error(`Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
        if (!r.body.role) throw new Error('No role in response');
        loginOk = true;
        return r;
    });
    await test('POST /api/auth/login (wrong password) → 401', async () => {
        const r = await request('POST', '/api/auth/login', { email: 'admin@tech-solutions.sa', password: 'wrong' });
        if (r.status !== 401) throw new Error(`Expected 401, got ${r.status}`);
        return r;
    });
    await test('POST /api/auth/login (missing fields) → 400', async () => {
        const r = await request('POST', '/api/auth/login', { email: 'admin@tech-solutions.sa' });
        if (r.status !== 400) throw new Error(`Expected 400, got ${r.status}`);
        return r;
    });

    // ── 3. Admin - Users ─────────────────────────────────────
    console.log('\n[ Admin - Users ]');
    const superAdminHeader = { 'x-user-role': 'SUPER_ADMIN' };
    const adminHeader = { 'x-user-role': 'IT_ADMIN' };

    await test('GET /api/admin/users (SUPER_ADMIN) → 200 array', async () => {
        const r = await request('GET', '/api/admin/users', null, superAdminHeader);
        if (r.status !== 200) throw new Error(`Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
        if (!Array.isArray(r.body)) throw new Error('Expected array');
        console.log(`       └─ Found ${r.body.length} user(s)`);
        return r;
    });
    await test('GET /api/admin/users (IT_ADMIN) → 403 forbidden', async () => {
        const r = await request('GET', '/api/admin/users', null, adminHeader);
        if (r.status !== 403) throw new Error(`Expected 403, got ${r.status}`);
        return r;
    });

    const testEmail = `test-${Date.now()}@example.com`;
    let testUserId;
    await test('POST /api/admin/users (create) → 200', async () => {
        const r = await request('POST', '/api/admin/users', { email: testEmail, password: 'test123', name: 'Test User', role: 'TAX_OFFICER' }, superAdminHeader);
        if (r.status !== 200) throw new Error(`Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
        testUserId = r.body.id;
        return r;
    });
    if (testUserId) {
        await test('DELETE /api/admin/users/:id → 200', async () => {
            const r = await request('DELETE', `/api/admin/users/${testUserId}`, null, superAdminHeader);
            if (r.status !== 200) throw new Error(`Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
            return r;
        });
    }

    // ── 4. Admin - Companies ─────────────────────────────────
    console.log('\n[ Admin - Companies ]');
    await test('GET /api/admin/companies → 200 array', async () => {
        const r = await request('GET', '/api/admin/companies', null, superAdminHeader);
        if (r.status !== 200) throw new Error(`Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
        if (!Array.isArray(r.body)) throw new Error('Expected array');
        console.log(`       └─ Found ${r.body.length} company(s)`);
        return r;
    });

    // ── 5. ERP Integration - Pull ────────────────────────────
    console.log('\n[ ERP Integration ]');
    await test('POST /api/erp/pull (missing vat) → 400', async () => {
        const r = await request('POST', '/api/erp/pull', { sourceUrl: 'http://example.com' });
        if (r.status !== 400) throw new Error(`Expected 400, got ${r.status}`);
        return r;
    });
    await test('POST /api/erp/pull (invalid company vat) → 500 with message', async () => {
        const r = await request('POST', '/api/erp/pull', {
            sourceUrl: 'http://jsonplaceholder.typicode.com/posts',
            authHeader: '',
            vat: '000000000000000'
        });
        if (r.status !== 500) throw new Error(`Expected 500, got ${r.status}`);
        if (!r.body.error) throw new Error('Expected error in body');
        return r;
    });

    // ── 6. ZATCA routes ──────────────────────────────────────
    console.log('\n[ ZATCA Routes ]');
    await test('GET /api/zatca routes → not 404', async () => {
        const r = await request('GET', '/api/zatca/companies');
        if (r.status === 404) throw new Error('Route not found');
        return r;
    });

    // ── Summary ──────────────────────────────────────────────
    console.log('\n========================================');
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('========================================\n');
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
