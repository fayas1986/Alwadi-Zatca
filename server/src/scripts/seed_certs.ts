import { PrismaClient } from '@prisma/client';
import { encrypt } from '../utils/crypto.js';

const prisma = new PrismaClient();

async function seedCerts() {
    try {
        const company = await prisma.company.findFirst({
            where: { vat_number: '300000000000003' } // Using the VAT from the dashboard
        });

        if (!company) {
            console.error('Company not found. Please ensure the company with VAT 300000000000003 exists.');
            return;
        }

        console.log(`Seeding mock certificates for company: ${company.registered_name}`);

        // Mock Certificate Data
        const mockCerts = [
            {
                company_id: company.id,
                type: 'PRODUCTION',
                certificate: 'MOCK_PRODUCTION_CERTIFICATE_CONTENT',
                private_key: encrypt('MOCK_PRIVATE_KEY'),
                public_key: 'MOCK_PUBLIC_KEY',
                serial_number: '1-ZatcaConnect|2-Desktop|3-PROD-001',
                expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
                is_active: true,
                csid: 'MOCK_CSID_PROD',
                secret: encrypt('MOCK_SECRET_PROD')
            },
            {
                company_id: company.id,
                type: 'SIMULATION',
                certificate: 'MOCK_SIMULATION_CERTIFICATE_CONTENT',
                private_key: encrypt('MOCK_PRIVATE_KEY_SIM'),
                public_key: 'MOCK_PUBLIC_KEY_SIM',
                serial_number: '1-ZatcaConnect|2-Desktop|3-SIM-001',
                expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                is_active: true,
                csid: 'MOCK_CSID_SIM',
                secret: encrypt('MOCK_SECRET_SIM')
            }
        ];

        for (const cert of mockCerts) {
            const existing = await prisma.certificate.findFirst({
                where: { 
                    company_id: cert.company_id,
                    serial_number: cert.serial_number
                }
            });

            if (existing) {
                console.log(`Certificate ${cert.serial_number} already exists. Skipping.`);
                continue;
            }

            await prisma.certificate.create({
                data: cert
            });
            console.log(`Created ${cert.type} certificate: ${cert.serial_number}`);
        }

        console.log('Seeding completed successfully.');
    } catch (error) {
        console.error('Error seeding certificates:', error);
    } finally {
        await prisma.$disconnect();
    }
}

seedCerts();
