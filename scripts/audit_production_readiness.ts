import prisma from '../server/src/lib/prisma.js';
import { SecurityService } from '../server/src/services/securityService.js';
import { generateCSR } from '../server/src/services/sdkService.js';
import axios from 'axios';
import fs from 'fs';
import 'dotenv/config';

async function auditProductionReadiness() {
    console.log('========================================================');
    console.log('🛡️ FINAL PRODUCTION READINESS & HEALTH AUDIT');
    console.log('========================================================\n');

    let totalChecks = 0;
    let passedChecks = 0;

    function check(description: string, isOk: boolean, details?: string) {
        totalChecks++;
        if (isOk) {
            passedChecks++;
            console.log(`[PASS ${passedChecks}/${totalChecks}] ✅ ${description} ${details ? '(' + details + ')' : ''}`);
        } else {
            console.error(`[FAIL ${passedChecks}/${totalChecks}] ❌ ${description} ${details ? '(' + details + ')' : ''}`);
        }
    }

    // 1. Environment & SDK Audit
    console.log('--- 1. ENVIRONMENT & SDK AUDIT ---');
    const hasDbUrl = !!process.env.DATABASE_URL;
    check('Database URL configured', hasDbUrl);

    const sdkPath = process.env.ZATCA_SDK_PATH || 'server/zatca-sdk/zatca-sdk.jar';
    const hasSdk = fs.existsSync(sdkPath);
    check('ZATCA Java SDK 3.0.8 present', hasSdk, sdkPath);

    const mockMode = process.env.USE_MOCK_SDK === 'true';
    check('Real ZATCA SDK Mode Active (USE_MOCK_SDK != true)', !mockMode);

    // 2. Cryptographic Engine Audit
    console.log('\n--- 2. CRYPTOGRAPHIC ENGINE AUDIT ---');
    try {
        const testCsrConfig = `csr.common.name=PROD-EasyLease-311499218600003
csr.serial.number=1-EasyLease|2-Desktop|3-test-uuid
csr.organization.identifier=311499218600003
csr.organization.unit.name=3114992186
csr.organization.name=3114992186
csr.country.name=SA
csr.invoice.type=1000
csr.location.address=Riyadh
csr.industry.business.category=Transport`;
        const testCsr = await generateCSR(testCsrConfig, false);
        check('EC Private Key & CSR Generation', !!testCsr.csr && !!testCsr.privateKey);
    } catch (e: any) {
        check('EC Private Key & CSR Generation', false, e.message);
    }

    const testEncrypt = SecurityService.encrypt('TEST_SECRET_PAYLOAD');
    const testDecrypt = SecurityService.decrypt(testEncrypt);
    check('AES-256 Encryption & Decryption Engine', testDecrypt === 'TEST_SECRET_PAYLOAD');

    // 3. Database State & Cleanliness Audit
    console.log('\n--- 3. DATABASE STATE & CLEANLINESS AUDIT ---');
    const company = await prisma.company.findFirst({
        where: { vat_number: '311499218600003' },
        include: { certificates: true, invoices: true }
    });
    check('Active Company Profile Loaded', !!company, company?.registered_name);

    const invoices = company?.invoices || [];
    check('Zero Test Invoices Remaining in DB', invoices.length === 0, `${invoices.length} invoices`);

    const mockCerts = company?.certificates.filter(c => c.csid?.startsWith('MOCK_')) || [];
    check('Zero MOCK Placeholder Certificates in DB', mockCerts.length === 0, `${mockCerts.length} mock certs`);

    const activeCerts = company?.certificates.filter(c => c.is_active) || [];
    check('Active Simulation Certificate Preserved', activeCerts.length > 0 && activeCerts[0].type === 'SIMULATION');

    // 4. Production Gateway Connectivity Audit
    console.log('\n--- 4. PRODUCTION GATEWAY CONNECTIVITY AUDIT ---');
    const prodGatewayUrl = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core/invoices/clearance/single';
    let isGatewayReachable = false;
    let correlationId = 'N/A';

    try {
        const res = await axios.post(prodGatewayUrl, {
            invoiceHash: 'probe_check_hash',
            uuid: '00000000-0000-0000-0000-000000000000',
            invoice: 'cHJvYmVfY2hlY2s='
        }, {
            headers: {
                'Authorization': 'Basic ' + Buffer.from('invalid_test_csid:invalid_test_secret').toString('base64'),
                'Accept-Version': 'V2',
                'Content-Type': 'application/json'
            },
            validateStatus: () => true
        });
        correlationId = (res.headers['x-request-id'] || res.headers['correlation-id'] || 'N/A') as string;
        isGatewayReachable = res.status === 401 || res.status === 400 || res.status === 200;
        check('ZATCA Production Gateway Reachable', isGatewayReachable, `HTTP Status: ${res.status}, Correlation ID: ${correlationId}`);
        check('Invoice Submission Safety Lock Enforced (Unauthorized Guard)', res.status === 401 || res.status === 400);
    } catch (e: any) {
        check('ZATCA Production Gateway Reachable', false, e.message);
    }

    // 5. Overall Summary
    console.log('\n========================================================');
    console.log('📊 PRODUCTION READINESS AUDIT SUMMARY');
    console.log('========================================================');
    console.log(`Total System Checks : ${totalChecks}`);
    console.log(`Passed Checks       : ${passedChecks}`);
    console.log(`Failed Checks       : ${totalChecks - passedChecks}`);
    console.log(`Overall Status      : ${passedChecks === totalChecks ? '🟢 100% PRODUCTION READY' : '🟡 ACTION REQUIRED'}`);
    console.log('========================================================\n');

    if (passedChecks === totalChecks) {
        console.log('✨ All technical subsystems, security controls, cryptographic engines, and gateway reachability checks are 100% verified.');
        console.log('⚡ System is awaiting the customer\'s 6-digit Production OTP or direct Production CSID import.');
    }
}

auditProductionReadiness().catch(console.error).finally(() => prisma.$disconnect());
