import { PrismaClient, invoice_status, invoice_type } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
    try {
        console.log('Connecting to database...');
        const company = await prisma.company.findFirst();
        
        if (!company) {
            console.error('No company found to associate invoices with. Please create a company first.');
            return;
        }

        console.log(`Using company: ${company.name} (ID: ${company.id})`);

        // Create a mock customer
        const customer = await prisma.customer.create({
            data: {
                company_id: company.id,
                name: 'Mock Test Customer',
                vat_number: '310123456700003',
                address: '1234 Mock Street, Test District',
                city: 'Riyadh',
                country: 'SA'
            }
        });

        const invoicesToCreate = [
            {
                company_id: company.id,
                customer_id: customer.id,
                invoice_number: `MOCK-SIMP-${Date.now()}`,
                date: new Date('2024-05-15T14:30:00Z'),
                total_amount: 2300.00,
                tax_amount: 300.00,
                status: invoice_status.PENDING,
                type: invoice_type.SIMPLIFIED,
                metadata: {
                    items: [
                        { name: "Consulting Services", quantity: 1, unitPrice: 1000.00, total: 1000.00, vatRate: 0.15, taxCategory: "S" },
                        { name: "Software License", quantity: 2, unitPrice: 500.00, total: 1000.00, vatRate: 0.15, taxCategory: "S" }
                    ],
                    customer: {
                        name: "Walk-in Customer",
                        address: "4521 Prince Sultan Street, Al Olaya",
                        city: "Riyadh"
                    }
                }
            },
            {
                company_id: company.id,
                customer_id: customer.id,
                invoice_number: `MOCK-STD-${Date.now()}`,
                date: new Date('2024-05-16T09:15:00Z'),
                total_amount: 7935.00,
                tax_amount: 1035.00,
                status: invoice_status.PENDING,
                type: invoice_type.B2B,
                metadata: {
                    items: [
                        { name: "Server Rack (42U)", quantity: 1, unitPrice: 4500.00, total: 4500.00, vatRate: 0.15, taxCategory: "S" },
                        { name: "Network Switch", quantity: 2, unitPrice: 1200.00, total: 2400.00, vatRate: 0.15, taxCategory: "S" }
                    ],
                    customer: {
                        name: "Tech Corp Ltd.",
                        vatNumber: "300123456700003",
                        address: {
                            streetName: "King Fahd Road",
                            buildingNumber: "7890",
                            cityName: "Jeddah",
                            postalZone: "23456",
                            countryCode: "SA"
                        }
                    }
                }
            },
            {
                company_id: company.id,
                customer_id: customer.id,
                invoice_number: `MOCK-B2C-${Date.now()}`,
                date: new Date('2024-05-17T11:45:00Z'),
                total_amount: 862.50,
                tax_amount: 112.50,
                status: invoice_status.PENDING,
                type: invoice_type.SIMPLIFIED,
                metadata: {
                    items: [
                        { name: "Wireless Mouse", quantity: 5, unitPrice: 150.00, total: 750.00, vatRate: 0.15, taxCategory: "S" }
                    ],
                    customer: {
                        name: "Retail Client",
                        address: "6732 King Abdullah St",
                        city: "Dammam"
                    }
                }
            }
        ];

        console.log(`Inserting ${invoicesToCreate.length} mock invoices...`);
        
        for (const inv of invoicesToCreate) {
            await prisma.invoice.create({
                data: inv as any
            });
            console.log(`Created invoice: ${inv.invoice_number}`);
        }

        console.log('Successfully seeded mock invoices. You can now view them in the application UI.');
    } catch (error) {
        console.error('Error seeding data:', error);
    } finally {
        await prisma.$disconnect();
    }
}

seed();
