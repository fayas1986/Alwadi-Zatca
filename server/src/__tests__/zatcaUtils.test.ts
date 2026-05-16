
import { describe, it, expect } from 'vitest';
import { mask, maskSensitiveData } from '../utils/zatcaUtils.js';

describe('ZatcaUtils - Security Masking', () => {
    describe('mask utility', () => {
        it('should handle null/empty input', () => {
            expect(mask(null)).toBe('N/A');
            expect(mask('')).toBe('****'); // length 0 is <= 8
        });

        it('should return asterisks for very short strings', () => {
            expect(mask('123')).toBe('****');
        });

        it('should mask the middle of long strings', () => {
            const input = '1234567890';
            const result = mask(input);
            expect(result).toBe('1234....7890');
        });
    });

    describe('maskSensitiveData utility', () => {
        it('should return non-objects as-is', () => {
            expect(maskSensitiveData('plain string')).toBe('plain string');
            expect(maskSensitiveData(123)).toBe(123);
        });

        it('should NOT mask allowlisted keys (like secret/password if added to allowlist)', () => {
            const data = {
                id: 1,
                secret: 'super-secret-key-123456',
                token: 'myToken123'
            };
            const result = maskSensitiveData(data);
            expect(result.id).toBe(1);
            // Secret is now in allowlist for ERP config visibility
            expect(result.secret).toBe(data.secret);
            expect(result.token).toBe(data.token);
        });

        it('should NOT mask PII keys if they are in allowlist (like vatNumber)', () => {
            const data = {
                vatNumber: '300000000000003',
                customer_name: 'Fayas-Deepmind-User'
            };
            const result = maskSensitiveData(data);
            expect(result.vatNumber).toBe(data.vatNumber); // In allowlist
            expect(result.customer_name).toBe('Faya....User'); // Not in allowlist, masked (middle redacted)
        });

        it('should handle nested objects recursively', () => {
            const data = {
                metadata: {
                    zatcaResponse: {
                        secret: 'hidden-secret-999999'
                    }
                }
            };
            const result = maskSensitiveData(data);
            // secret is in allowlist
            expect(result.metadata.zatcaResponse.secret).toBe('hidden-secret-999999');
        });

        it('should handle arrays of objects', () => {
            const data = [
                { secret: 'secret1' },
                { secret: 'secret2' }
            ];
            const result = maskSensitiveData(data);
            expect(result[0].secret).toBe('secret1'); // Allowlisted
            expect(result[1].secret).toBe('secret2');
        });
    });
});
