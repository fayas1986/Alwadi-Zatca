
import axios from 'axios';
import 'dotenv/config';

const BASE_URL = 'http://localhost:3001/api';
const AUTH_HEADERS = {
    'x-user-role': 'SUPER_ADMIN',
    'x-user-email': 'admin@zatcaconnect.com', // Using a default admin email
    'Content-Type': 'application/json'
};

const log = (step: string, msg: string, status: 'info' | 'success' | 'fail' | 'warn' = 'info') => {
    const icons = { info: 'ℹ️', success: '✅', fail: '❌', warn: '⚠️' };
    console.log(`${icons[status]} [${step}] ${msg}`);
};

async function safeFetch(url: string, options: any = {}) {
    try {
        const resp = await axios({
            url,
            ...options,
            headers: { ...AUTH_HEADERS, ...options.headers },
            validateStatus: () => true
        });
        return { status: resp.status, data: resp.data, ok: resp.status >= 200 && resp.status < 300 };
    } catch (err: any) {
        return { status: 0, data: err.message, ok: false, error: err.message };
    }
}

async function runMasterVerification() {
    console.log('\n====================================================');
    console.log('🚀 ZATCACONNECT MASTER E2E VERIFICATION SWEEP');
    console.log('====================================================\n');

    // 1. HEALTH & SYSTEM
    log('SYSTEM', 'Checking Backend Health...');
    const health = await safeFetch('http://localhost:3001/health');
    if (health.ok) {
        log('SYSTEM', `Backend Online (Version: ${health.data.version || '1.0.0'})`, 'success');
    } else {
        log('SYSTEM', 'Backend OFFLINE or UNREACHABLE', 'fail');
    }

    // 2. ZATCA PINGS
    log('ZATCA', 'Verifying Portal Connectivity...');
    const envs = ['sandbox', 'simulation', 'production'];
    for (const env of envs) {
        const ping = await safeFetch(`${BASE_URL}/zatca/ping/${env}`);
        if (ping.ok && ping.data.success) {
            log('ZATCA', `${env.toUpperCase()} is ONLINE (${ping.data.latencyMs}ms)`, 'success');
        } else {
            log('ZATCA', `${env.toUpperCase()} is UNREACHABLE`, 'warn');
        }
    }

    // 3. API SIMULATOR (ERP SUBMIT)
    log('SIMULATOR', 'Testing API Simulator (ERP Submission)...');
    const invNum = `E2E-FINAL-${Date.now()}`;
    const submit = await safeFetch(`${BASE_URL}/erp/invoices/submit`, {
        method: 'POST',
        data: {
            invoiceNumber: invNum,
            invoiceSubtype: 'Standard',
            issueDate: new Date().toISOString(),
            totalAmount: 115.0,
            vatAmount: 15.0,
            supplier: { vatNumber: '300000000000003' },
            items: [{ name: 'E2E Final Check', quantity: 1, unitPrice: 100, subtotal: 100, total: 115 }]
        }
    });

    if (submit.ok) {
        log('SIMULATOR', `ERP Submission SUCCESS (InvoiceID: ${submit.data.invoiceId})`, 'success');
        
        // Check ID persistence
        const id = submit.data.invoiceId;
        const detail = await safeFetch(`${BASE_URL}/zatca/invoices/${id}`);
        if (detail.ok) {
            log('SIMULATOR', `Persistence Verified (Stored Invoice #${detail.data.invoiceNumber})`, 'success');
        } else {
            log('SIMULATOR', `Persistence Failed (ID not found in DB)`, 'fail');
        }
    } else {
        log('SIMULATOR', `ERP Submission FAILED (${submit.status})`, 'fail');
    }

    // 4. ERP PULL FUNCTIONALITY
    log('ERP_PULL', 'Testing External ERP Pull Integration (Pulling from Mock Server)...');
    const pull = await safeFetch(`${BASE_URL}/erp/pull`, {
        method: 'POST',
        data: { 
            sourceUrl: 'http://localhost:3001/api/erp/mock-server',
            vat: '300000000000003' 
        }
    });
    if (pull.ok) {
        log('ERP_PULL', `ERP Pull SUCCESS (Found Invoices: ${pull.data.results?.length || 0})`, 'success');
    } else {
        log('ERP_PULL', `ERP Pull FAILED (${pull.status}) - ${JSON.stringify(pull.data)}`, 'fail');
    }

    // 5. REPORTING SERVICE
    log('REPORTING', 'Testing Report Generation Engine...');
    const templates = await safeFetch(`${BASE_URL}/admin/reports/templates`);
    if (templates.ok && templates.data.length > 0) {
        const tid = templates.data[0].id;
        log('REPORTING', `Found Template: "${templates.data[0].name}"`, 'info');
        
        // Test JSON Generation
        const jsonGen = await safeFetch(`${BASE_URL}/admin/reports/generate/${tid}`, {
            method: 'POST',
            data: { format: 'json', dateRange: { start: '2020-01-01', end: '2030-12-31' } }
        });
        log('REPORTING', `JSON Generation: ${jsonGen.ok ? 'SUCCESS' : 'FAILED'}`, jsonGen.ok ? 'success' : 'fail');
        
        // Test CSV Generation
        const csvGen = await safeFetch(`${BASE_URL}/admin/reports/generate/${tid}`, {
            method: 'POST',
            data: { format: 'csv', dateRange: { start: '2020-01-01', end: '2030-12-31' } }
        });
        log('REPORTING', `CSV Generation: ${csvGen.ok ? 'SUCCESS' : 'FAILED'}`, csvGen.ok ? 'success' : 'fail');
    } else {
        log('REPORTING', 'No templates found or API error', 'fail');
    }

    // 6. AUDIT LOGS
    log('AUDIT', 'Verifying System Audit Trails...');
    const audit = await safeFetch(`${BASE_URL}/admin/audit-logs?limit=5`);
    if (audit.ok && audit.data.logs.length > 0) {
        log('AUDIT', `Latest Activity: "${audit.data.logs[0].action}" by ${audit.data.logs[0].user_email}`, 'success');
    } else {
        log('AUDIT', 'Audit logs empty or unreachable', 'warn');
    }

    console.log('\n====================================================');
    console.log('🏁 MASTER VERIFICATION SWEEP COMPLETE');
    console.log('====================================================\n');
}

runMasterVerification().catch(e => {
    console.error('❌ FATAL VERIFICATION ERROR:', e);
});
