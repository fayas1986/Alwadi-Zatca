import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { SecurityService } from '../services/securityService.js';

describe('HMAC Backward Compatibility', () => {
    it('should correctly authenticate a legacy V1 request that hashes an empty JSON stringified body', () => {
        const secret = 'sk_test_123';
        const timestamp = Date.now().toString();
        const nonce = 'random-nonce';
        const method = 'GET';
        const path = '/api/v1/erp/status/123';
        const body = {};

        // Legacy clients used to hash JSON.stringify({}) even for GET requests or empty bodies.
        const legacyBodyHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
        
        // This is what the legacy client sends in x-signature
        const legacySignature = crypto.createHmac('sha256', secret)
            .update(`${timestamp}${nonce}${method}${path}${legacyBodyHash}`)
            .digest('hex');

        // This verifies if our V2 service still accepts the legacy signature pattern
        const result = SecurityService.verifySignature(
            secret,
            timestamp,
            nonce,
            method,
            path,
            body,
            legacySignature
        );

        // This will fail initially because the new strict SecurityService expects an empty bodyHash
        // for GET requests and empty objects. We must implement a fallback in our server logic.
        expect(result.isValid).toBe(true);
    });
});
