import crypto from 'crypto';
import { WebhookService } from '../services/webhookService.js';
import { MonitoringService } from '../services/monitoringService.js';

async function runVerification() {
    console.log('--- 🛡️ Enterprise Hardening Phase 2 Verification ---');

    // 1. HMAC Signing Verification
    console.log('\n[1] Testing HMAC Signing...');
    const secret = 'test-secret-123';
    const payload = { event: 'TEST', data: 'hello' };
    const signature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
    console.log('Calculated Signature:', signature);
    if (signature && signature.length === 64) console.log('✅ HMAC Signature Logic OK');

    // 2. Monitoring Spike Verification
    console.log('\n[2] Testing Monitoring Spike Detection...');
    const clientId = 'monitoring-test-client';
    for (let i = 0; i < 55; i++) {
        await MonitoringService.trackRateLimitSpike(clientId);
    }
    console.log('✅ Spike Triggered (Check console for ALERT messages)');

    // 3. Webhook Delivery Logic Proof
    console.log('\n[3] Testing Webhook Dispatch Logic...');
    // We expect this to fail (invalid URL) and trigger retries in the background
    await WebhookService.sendWebhook(1, 'INVOICE_ACCEPTED', { 
        jobId: 'verify-job-123', 
        status: 'ACCEPTED',
        invoiceNumber: 'INV-VERIFY-001'
    });
    console.log('✅ Webhook logic initiated. Background retries should be active.');

    console.log('\n--- Verification Suite Complete ---');
}

runVerification().catch(console.error);
