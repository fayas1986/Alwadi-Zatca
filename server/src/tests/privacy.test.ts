import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrivacyService } from '../services/privacyService.js';
import { AuditService } from '../services/auditService.js';
import prisma from '../lib/prisma.js';

// Mock Prisma
vi.mock('../lib/prisma.js', () => ({
    default: {
        audit_log: {
            create: vi.fn().mockResolvedValue({ id: 1 })
        }
    }
}));

describe('Privacy and Redaction Logic', () => {
    describe('PrivacyService', () => {
        it('should redact blacklisted fields in an object', () => {
            const input = {
                invoice_id: 'INV-2026-X001',
                private_key: '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----',
                otp: '123456',
                unknown_field: 'sensitive_value'
            };
            const scrubbed = PrivacyService.scrubObject(input);
            
            expect(scrubbed.invoice_id).toBe('INV-2026-X001'); // Allowlisted field
            expect(scrubbed.private_key).toBe('[REDACTED]'); // Blacklisted
            expect(scrubbed.otp).toBe('[REDACTED]'); // Blacklisted
            expect(scrubbed.unknown_field).toBe('sens....alue'); // Not allowlisted, masked
        });

        it('should redact secrets in strings using regex', () => {
            const rawText = 'Error sending code 123456 to VAT 1234567890. Private Key: -----BEGIN PRIVATE KEY----- secret -----END PRIVATE KEY-----';
            const scrubbed = PrivacyService.scrubString(rawText);
            
            expect(scrubbed).toContain('[REDACTED_CODE]');
            expect(scrubbed).toContain('[REDACTED_PRIVATE_KEY]');
            expect(scrubbed).not.toContain('-----BEGIN PRIVATE KEY-----');
        });
    });

    describe('AuditService Integration', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should scrub details and metadata before calling prisma.create', async () => {
            await AuditService.log({
                action: 'TEST_ACTION',
                category: 'Security',
                user: 'test-user',
                role: 'ADMIN',
                ipAddress: '1.1.1.1',
                details: 'Found private key: -----BEGIN PRIVATE KEY----- ABC -----END PRIVATE KEY-----',
                status: 'Success',
                metadata: {
                    api_key: 'sk_test_123',
                    invoice_id: 'INV-2026-X002'
                }
            });

            // Wait for background log
            await new Promise(resolve => setTimeout(resolve, 50));

            const createCall = (prisma as any).audit_log.create.mock.calls[0][0];
            expect(createCall.data.details).toContain('[REDACTED_PRIVATE_KEY]');
            expect(createCall.data.metadata.api_key).toBe('sk_test_123'); // Now allowlisted
            expect(createCall.data.metadata.invoice_id).toBe('INV-2026-X002'); // Allowlisted
        });
    });
});
