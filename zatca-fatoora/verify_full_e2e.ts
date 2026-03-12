const BASE_URL = 'http://localhost:3001/api';
const AUTH_HEADERS = {
    'Authorization': 'Bearer e2e_master_token_sim',
    'x-user-role': 'SUPER_ADMIN',
    'Content-Type': 'application/json'
};

const log = (msg: string) => console.log(`[E2E] ${msg}`);

async function safeFetch(url: string, options: any = {}) {
    const resp = await fetch(url, { ...options, headers: { ...AUTH_HEADERS, ...options.headers } });
    const text = await resp.text();
    try {
        return { status: resp.status, data: JSON.parse(text), ok: resp.ok };
    } catch (e) {
        return { status: resp.status, data: text, ok: false, error: 'INVALID_JSON' };
    }
}

async function runE2E() {
    console.log('====================================================');
    console.log('🚀 STARTING FULL E2E SYSTEM VERIFICATION');
    console.log('====================================================\n');

    // 1. Health & DB
    log('Checking Backend Health...');
    const health = await safeFetch('http://localhost:3001/health');
    log(`Backend: ${health.data.status || 'ERROR'}`);

    log('Checking Database Connectivity...');
    const dbTest = await safeFetch(`${BASE_URL}/db-test`);
    log(`Database: ${dbTest.data.status} (Users: ${dbTest.data.userCount})`);

    // 2. Auth (Login simulation)
    log('Verifying Admin Access...');
    const authPing = await safeFetch(`${BASE_URL}/admin/companies`);
    log(`Admin Access: ${authPing.ok ? 'AUTHORIZED' : 'DENIED (' + authPing.status + ')'}`);
    if (!authPing.ok) log(`   Detail: ${typeof authPing.data === 'string' ? authPing.data.substring(0, 50) : JSON.stringify(authPing.data)}`);

    // 3. Super Admin Operations
    log('--- Super Admin: Company Group Management ---');
    const groupName = `E2E-Group-${Date.now()}`;
    const createGroup = await safeFetch(`${BASE_URL}/admin/groups`, {
        method: 'POST',
        body: JSON.stringify({ name: groupName, description: 'Created by E2E script' })
    });
    log(`Group Creation: ${createGroup.ok ? 'PASSED' : 'FAILED'}`);

    // 4. ERP Integration
    log('--- ERP: API Simulation (B2B & B2C) ---');
    const erpInvoices = [
        { type: 'Standard', num: `E2E-B2B-${Date.now()}` },
        { type: 'Simplified', num: `E2E-B2C-${Date.now()}` }
    ];

    for (const inv of erpInvoices) {
        const resp = await safeFetch(`${BASE_URL}/erp/invoices/submit`, {
            method: 'POST',
            body: JSON.stringify({
                invoiceNumber: inv.num,
                invoiceSubtype: inv.type,
                issueDate: new Date().toISOString(),
                totalAmount: 1150.00,
                vatAmount: 150.00,
                items: [{ name: 'System Verification', quantity: 1, unitPrice: 1000, subtotal: 1000, total: 1150 }]
            })
        });
        log(`ERP ${inv.type} Submission: ${resp.ok ? 'PASSED' : 'FAILED'}`);
        if (resp.ok) log(`   Generated Hash: ${resp.data.hash.substring(0, 15)}...`);
    }

    // 5. ZATCA Environment Reachability
    log('--- ZATCA: Environment Pings ---');
    const envs = ['sandbox', 'simulation'];
    for (const env of envs) {
        const ping = await safeFetch(`${BASE_URL}/zatca/ping/${env}`);
        log(`ZATCA ${env.toUpperCase()}: ${ping.data.online ? 'REACHABLE' : 'TIMEOUT'}`);
    }

    console.log('\n====================================================');
    console.log('🏁 E2E VERIFICATION COMPLETE');
    console.log('====================================================');
}

runE2E().catch(err => {
    console.error('❌ E2E System Failure:', err);
});

runE2E().catch(err => {
    console.error('❌ E2E System Failure:', err);
});
