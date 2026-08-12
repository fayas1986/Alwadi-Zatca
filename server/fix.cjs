const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fix() {
    try {
        await prisma.company.update({
            where: { id: 2 },
            data: { vat_number: '311499218600003-old' }
        });
        console.log("Fixed Company 2 VAT");
    } catch (e) {
        console.log(e.message);
    }
}

fix().finally(() => {
    prisma.$disconnect();
});
