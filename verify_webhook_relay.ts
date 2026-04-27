
import { PrismaClient } from '@prisma/client';
import { WebhookService } from './server/src/services/webhookService.js';
import { reflectStatusToERP } from './server/src/services/integrationService.js';

const prisma = new PrismaClient();

async function testRelay() {
    console.log('🧪 Starting Webhook Relay Verification...');

    // 1. Setup a dummy company with webhook settings
    const vatNumber = 'TEST-WEBHOOK-' + Date.now();
    const company = await prisma.company.create({
        data: {
            registered_name: 'Webhook Test Corp',
            vat_number: vatNumber,
            cr_number: '1234567890',
            user_id: 'user_2m1F6P1Z7l0XN0XN0XN0XN0XN0X', // Assuming a valid user ID
            settings: {
                webhookUrl: 'https://webhook.site/dummy-url',
                webhookSecret: 'test-secret-123',
                webhookEvents: ['INVOICE_CLEARED', 'INVOICE_REJECTED']
            }
        }
    });

    console.log(`✅ Test Company Created: ${company.id}`);

    try {
        // 2. Simulate a Clearance event
        console.log('📡 Simulating INVOICE_CLEARED event...');
        
        // We override console.log to capture the output since we don't have a real listener
        const originalLog = console.log;
        let intercepted = false;
        console.log = (...args: any[]) => {
            if (args[0]?.includes('[Webhook] Dispatching INVOICE_CLEARED')) {
                intercepted = true;
            }
            originalLog(...args);
        };

        await reflectStatusToERP(
            company.id,
            'INV-TEST-001',
            'uuid-test-001',
            'CLEARED',
            { clearanceStatus: 'CLEARED', validationResults: { warningMessages: [] } }
        );

        if (intercepted) {
            console.log('\n✨ VERIFICATION SUCCESS: WebhookService was triggered by reflectStatusToERP!');
        } else {
            console.error('\n❌ VERIFICATION FAILED: WebhookService was not triggered.');
        }

        console.log = originalLog;

    } finally {
        // Cleanup
        await prisma.company.delete({ where: { id: company.id } });
        await prisma.$disconnect();
    }
}

testRelay().catch(console.error);
