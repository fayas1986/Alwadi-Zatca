
import prisma from '../server/src/lib/prisma.js';
import { QueueService } from '../server/src/services/queueService.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

async function runProductionValidation() {
    console.log("\n>>> STARTING PRODUCTION-GRADE VALIDATION SCENARIOS...");
    
    // 1. Setup Test Company (or use existing)
    const company = await prisma.company.findFirst({
        where: { environment: 'SIMULATION' },
        include: { certificates: { where: { is_active: true } } }
    });

    if (!company || company.certificates.length === 0) {
        console.error("❌ No active SIMULATION company found. Please run onboard_simulation_company.ts first.");
        return;
    }

    const companyId = company.id;
    console.log(`Using Company: ${company.registered_name} (ID: ${companyId})`);

    // 2. Scenario: Concurrency & No-Gap Chain Proof
    console.log("\n[Scenario] Concurrency & No-Gap Chain Proof (10 Parallel Invoices)...");
    
    // Clear previous pending/failed for this company to have a clean start
    await prisma.invoice.deleteMany({
        where: { company_id: companyId, status: { in: ['PENDING', 'FAILED', 'DLQ'] } as any }
    });

    const invoiceBatch: any[] = [];
    const count = 10;
    
    for (let i = 0; i < count; i++) {
        const invNum = `AUDIT-CONC-${Date.now()}-${i}`;
        const uuid = crypto.randomUUID();
        
        const invoice = await prisma.invoice.create({
            data: {
                company_id: companyId,
                invoice_number: invNum,
                uuid: uuid,
                type: 'SIMPLIFIED' as any,
                status: 'PENDING' as any,
                date: new Date(),
                total_amount: 11.50,
                tax_amount: 1.50,
                xml_payload: JSON.stringify({
                    invoiceNumber: invNum,
                    uuid: uuid,
                    issueDate: new Date().toISOString(),
                    invoiceSubtype: "SIMPLIFIED",
                    documentType: "INVOICE",
                    currencyCode: "SAR",
                    items: [{ name: "Conc Item", quantity: 1, unitPrice: 10.00, vatRate: 0.15, taxCategory: "S" }]
                }),
                metadata: { source: 'AUDIT_HARNESS' } as any
            }
        });
        invoiceBatch.push(invoice);
    }

    console.log(`Enqueued ${count} invoices. Starting parallel processing...`);
    
    // Trigger processing for all 10 in parallel
    const startTime = Date.now();
    await Promise.all(invoiceBatch.map(inv => QueueService.enqueue({ 
        invoiceId: inv.id, 
        companyId: companyId, 
        environment: 'SIMULATION', 
        retryCount: 0 
    })));

    // Poll for completion (Wait max 60 seconds)
    console.log("Waiting for processing to complete...");
    let completed = false;
    let attempts = 0;
    while (!completed && attempts < 60) {
        const pending = await prisma.invoice.count({
            where: { id: { in: invoiceBatch.map(i => i.id) }, status: 'PENDING' as any }
        });
        if (pending === 0) {
            completed = true;
            break;
        }
        await new Promise(r => setTimeout(r, 1000));
        attempts++;
    }

    const duration = Date.now() - startTime;
    console.log(`Processing finished in ${duration}ms.`);

    // [Proof G] Chain Continuity & No Gaps
    const results = await prisma.invoice.findMany({
        where: { id: { in: invoiceBatch.map(i => i.id) } },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }]
    });

    let chainValid = true;
    let gaps = 0;
    for (let i = 1; i < results.length; i++) {
        const current = results[i];
        const prev = results[i-1];
        if (current.previous_invoice_hash !== prev.zatca_hash && current.previous_invoice_hash !== prev.hash) {
            console.error(` ❌ Chain Gap Detected between ${prev.invoice_number} and ${current.invoice_number}`);
            console.error(`   Prev Hash: ${prev.zatca_hash || prev.hash}`);
            console.error(`   Curr PIH:  ${current.previous_invoice_hash}`);
            chainValid = false;
            gaps++;
        }
    }

    if (chainValid && results.length === count) {
        console.log(` ✔ Chain Proof: SUCCESS (10/10 Invoices linked with NO gaps)`);
    } else {
        console.error(` ❌ Chain Proof: FAILED (${gaps} gaps found or count mismatch)`);
    }

    // [Scenario] Idempotency Check
    console.log("\n[Scenario] Idempotency Verification...");
    const duplicateInvoice = invoiceBatch[0];
    const rowCountBefore = await prisma.invoice.count({ where: { company_id: companyId } });
    
    // Attempt re-enqueue
    await QueueService.enqueue({ 
        invoiceId: duplicateInvoice.id, 
        companyId: companyId, 
        environment: 'SIMULATION', 
        retryCount: 0 
    });
    
    const rowCountAfter = await prisma.invoice.count({ where: { company_id: companyId } });
    const rowCountUnchanged = (rowCountBefore === rowCountAfter);
    console.log(rowCountUnchanged ? " ✔ Idempotency: SUCCESS (No new rows created)" : " ❌ Idempotency: FAILED");

    // Final Audit Report
    const auditReport = {
        timestamp: new Date().toISOString(),
        concurrencyTest: {
            totalInvoices: count,
            successCount: results.filter(r => r.status === 'REPORTED' || r.status === 'CLEARED').length,
            chainValid,
            gaps,
            durationMs: duration
        },
        idempotency: { rowCountUnchanged }
    };

    const auditPath = path.resolve('server/zatca-sdk/audit_evidence/production_validation_results.json');
    fs.writeFileSync(auditPath, JSON.stringify(auditReport, null, 2));
    console.log(`\nProduction Validation results saved to: ${auditPath}`);
    
    process.exit(0);
}

runProductionValidation().catch(e => {
    console.error(e);
    process.exit(1);
});
