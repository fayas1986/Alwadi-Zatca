import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const invoices = await prisma.invoice.findMany({});
    const missing = invoices.filter(inv => !inv.metadata);
    
    console.log(`Found ${missing.length} invoices with null metadata`);

    let fixedCount = 0;
    for (const inv of missing) {
        if (!inv.xml_payload) continue;
        try {
            const payload = JSON.parse(inv.xml_payload);
            if (payload && payload.items) {
                const customer = payload.customer || { name: 'Unknown Customer' };
                await prisma.invoice.update({
                    where: { id: inv.id },
                    data: {
                        metadata: {
                            customer,
                            items: payload.items
                        }
                    }
                });
                console.log(`Fixed invoice ${inv.invoice_number}`);
                fixedCount++;
            }
        } catch (e) {
            console.error(`Error parsing xml_payload for ${inv.invoice_number}`, e);
        }
    }
    console.log(`Finished fixing ${fixedCount} invoices.`);
}

main().finally(() => prisma.$disconnect());
