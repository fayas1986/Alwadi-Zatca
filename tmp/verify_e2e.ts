import prisma from '../server/src/lib/prisma';
import axios from 'axios';
import https from 'https';

async function verify() {
    const companyId = 38;
    console.log(`\n--- VERIFYING COMPANY ${companyId} ---`);

    // 1. Check ERP Configs
    const erpConfigs = await prisma.erp_configuration.findMany({
        where: { company_id: companyId }
    });
    console.log('\nERP CONFIGURATIONS:');
    erpConfigs.forEach(c => {
        console.log(`- Env: ${c.environment}, URL: ${c.base_url}, Active: ${c.is_active}`);
    });

    // 2. Check Certificates
    const certs = await prisma.certificate.findMany({
        where: { company_id: companyId }
    });
    console.log('\nCERTIFICATES:');
    certs.forEach(c => {
        console.log(`- Type: ${c.type}, SN: ${c.serial_number}, Active: ${c.is_active}, Has CSID: ${!!c.csid}`);
    });

    // 3. ZATCA Connectivity (Real-time Ping)
    console.log('\nZATCA CONNECTIVITY CHECK:');
    const hosts = [
        { name: 'Sandbox', host: 'sandbox.zatca.gov.sa' },
        { name: 'Simulation', host: 'gw-fatoora.zatca.gov.sa' },
        { name: 'Production', host: 'core.zatca.gov.sa' }
    ];

    for (const h of hosts) {
        try {
            const start = Date.now();
            const response = await axios.head(`https://${h.host}`, { 
                timeout: 5000,
                httpsAgent: new https.Agent({ rejectUnauthorized: false }) 
            });
            console.log(`[PASS] ${h.name} (${h.host}) is UP. Status: ${response.status}, Latency: ${Date.now() - start}ms`);
        } catch (err: any) {
             console.log(`[FAIL] ${h.name} (${h.host}) is DOWN or Unreachable. Error: ${err.message}`);
        }
    }

    // 4. Check for Recent Invoices
    const recentInvoices = await prisma.invoice.count({
        where: { company_id: companyId }
    });
    console.log(`\nTOTAL INVOICES IN DB: ${recentInvoices}`);

    process.exit(0);
}

verify();
