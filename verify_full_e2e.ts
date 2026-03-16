const BASE_URL = 'http://localhost:3001/api';
const AUTH_HEADERS = {
    'Authorization': 'Bearer e2e_master_token_sim',
    'x-user-role': 'SUPER_ADMIN',
    'Content-Type': 'application/json'
};

const log = (msg: string) => console.log(`[E2E] ${msg}`);

async function safeFetch(url: string, options: any = {}) {
    try {
        const resp = await fetch(url, { ...options, headers: { ...AUTH_HEADERS, ...options.headers } });
        const text = await resp.text();
        try {
            return { status: resp.status, data: JSON.parse(text), ok: resp.ok };
        } catch (e) {
            return { status: resp.status, data: text, ok: resp.ok, error: 'INVALID_JSON' };
        }
    } catch (err: any) {
        return { status: 0, data: err.message, ok: false, error: 'FETCH_ERROR' };
    }
}

async function runE2E() {
    console.log('====================================================');
    console.log('🚀 STARTING MASTER E2E SYSTEM VERIFICATION');
    console.log('====================================================\n');

    // 1. Health & DB
    log('--- System: Health & Database ---');
    const health = await safeFetch('http://localhost:3001/health');
    log(`Backend Health: ${health.data.status || 'ERROR'}`);

    const dbTest = await safeFetch(`${BASE_URL}/db-test`);
    log(`Database Status: ${dbTest.data.status} (Users Found: ${dbTest.data.userCount})`);

    // 2. Auth & Admin
    log('--- Auth: Admin Access Control ---');
    const authPing = await safeFetch(`${BASE_URL}/admin/companies`);
    log(`Admin Authorization: ${authPing.ok ? 'SUCCESS' : 'DENIED (' + authPing.status + ')'}`);

    // 3. ERP & Persistence Fix Check (Recently Implemented)
    log('--- Persistence: ERP Submission & ID Retrieval ---');
    const invNum = `E2E-TEST-${Date.now()}`;
    const submitResp = await safeFetch(`${BASE_URL}/erp/invoices/submit`, {
        method: 'POST',
        body: JSON.stringify({
            invoiceNumber: invNum,
            invoiceSubtype: 'Standard',
            issueDate: new Date().toISOString(),
            totalAmount: 115.00,
            vatAmount: 15.00,
            supplier: { vatNumber: '300000000000003' },
            items: [{ name: 'E2E Verification Item', quantity: 1, unitPrice: 100, subtotal: 100, total: 115 }]
        })
    });

    if (!submitResp.ok) {
        log(`ERP Submission: FAILED (${submitResp.status})`);
        log(`   Reason: ${JSON.stringify(submitResp.data)}`);
    } else {
        const invoiceId = submitResp.data.invoiceId;
        log(`ERP Submission: SUCCESS (InvoiceID: ${invoiceId})`);
        
        if (!invoiceId) {
            log('   WARNING: No InvoiceID returned. Skipping detail retrieval test.');
        } else {
            // CRITICAL: Verify the fix for the "Invoice not found" issue
            log('Verifying Invoice Detail Retrieval...');
            const detailResp = await safeFetch(`${BASE_URL}/zatca/invoices/${invoiceId}`);
            if (detailResp.ok) {
                log(`Invoice Detail: SUCCESS (Found Invoice # ${detailResp.data.invoiceNumber})`);
                log(`   Status: ${detailResp.data.status}`);
                log(`   Total: ${detailResp.data.totalAmount} ${detailResp.data.currencyCode}`);
            } else {
                log(`Invoice Detail: FAILED (${detailResp.status})`);
                log(`   Reason: ${JSON.stringify(detailResp.data)}`);
            }
        }
    }

    // 4. ZATCA Environment Reachability
    log('--- ZATCA: Environment Connectivity ---');
    const envs = ['sandbox', 'simulation'];
    for (const env of envs) {
        const ping = await safeFetch(`${BASE_URL}/zatca/ping/${env}`);
        const status = ping.data?.online ? 'REACHABLE' : 'UNREACHABLE';
        log(`ZATCA ${env.toUpperCase()}: ${status} (${ping.data?.latencyMs || 'N/A'}ms)`);
    }

    console.log('\n====================================================');
    console.log('🏁 MASTER E2E VERIFICATION COMPLETE');
    console.log('====================================================');
}

runE2E().catch(err => {
    console.error('❌ CRITICAL SYSTEM ERROR DURING E2E:', err);
    process.exit(1);
});
