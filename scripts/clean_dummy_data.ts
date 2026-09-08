import prisma from '../server/src/lib/prisma.js';

async function auditAndCleanDummyData() {
    console.log('========================================================');
    console.log('🧹 AUDITING & CLEANING DUMMY / TEST DATA IN DATABASE');
    console.log('========================================================\n');

    // 1. Audit Invoices
    const allInvoices = await prisma.invoice.findMany();
    const testInvoices = allInvoices.filter(inv => 
        inv.invoice_number.startsWith('SIM-') ||
        inv.invoice_number.startsWith('COMPLIANCE-') ||
        inv.invoice_number.startsWith('INV-B2B-') ||
        inv.invoice_number.startsWith('INV-B2C-') ||
        inv.hash?.startsWith('mock_') ||
        inv.hash?.startsWith('probe_')
    );

    console.log(`[Invoices] Total records in DB: ${allInvoices.length}`);
    console.log(`[Invoices] Test/Dummy records found: ${testInvoices.length}`);

    // 2. Audit Certificates
    const allCerts = await prisma.certificate.findMany();
    const mockCerts = allCerts.filter(c => 
        c.csid?.startsWith('MOCK_') ||
        c.certificate?.startsWith('MOCK_') ||
        c.private_key?.startsWith('MOCK_') ||
        c.common_name?.includes('MOCK')
    );

    console.log(`\n[Certificates] Total certificates in DB: ${allCerts.length}`);
    console.log(`[Certificates] Mock placeholder certificates found: ${mockCerts.length}`);

    // 3. Purge Test Invoices
    if (testInvoices.length > 0) {
        console.log(`\nDeleting ${testInvoices.length} test invoice record(s)...`);
        const deletedInvoices = await prisma.invoice.deleteMany({
            where: {
                id: { in: testInvoices.map(i => i.id) }
            }
        });
        console.log(`✅ Cleared ${deletedInvoices.count} test invoice(s).`);
    }

    // 4. Purge Mock Placeholder Certificates
    if (mockCerts.length > 0) {
        console.log(`Deleting ${mockCerts.length} mock certificate record(s)...`);
        const deletedCerts = await prisma.certificate.deleteMany({
            where: {
                id: { in: mockCerts.map(c => c.id) }
            }
        });
        console.log(`✅ Cleared ${deletedCerts.count} mock certificate(s).`);
    }

    // 5. Audit Remaining Active Company & Credentials State
    const activeCompany = await prisma.company.findFirst({
        where: { vat_number: '311499218600003' },
        include: { certificates: true, invoices: true }
    });

    console.log('\n========================================================');
    console.log('📊 DATABASE CLEANUP SUMMARY');
    console.log('========================================================');
    console.log(`Company VAT         : ${activeCompany?.vat_number || 'N/A'}`);
    console.log(`Company Name        : ${activeCompany?.registered_name || 'N/A'}`);
    console.log(`Active Certificates : ${activeCompany?.certificates.filter(c => c.is_active).length || 0}`);
    console.log(`Total Certificates  : ${activeCompany?.certificates.length || 0}`);
    console.log(`Remaining Invoices  : ${activeCompany?.invoices.length || 0}`);
    console.log('========================================================\n');
    console.log('✨ Dummy & mock records successfully purged! System is clean for Production activation.');
}

auditAndCleanDummyData().catch(console.error).finally(() => prisma.$disconnect());
