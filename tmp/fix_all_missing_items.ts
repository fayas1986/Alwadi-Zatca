import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Find all invoices where metadata is missing or empty
    const invoices = await prisma.invoice.findMany({
        where: { metadata: { equals: null } }
    });
    
    console.log(`Found ${invoices.length} invoices with null metadata`);

    let fixedCount = 0;
    for (const inv of invoices) {
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