
import { describe, it, expect } from 'vitest';
import { ZatcaMappingService } from '../services/zatcaMappingService.js';

describe('ZatcaMappingService', () => {
    describe('mapEnv', () => {
        it('should map simulation correctly', () => {
            expect(ZatcaMappingService.mapEnv('simulation')).toBe('SIMULATION');
            expect(ZatcaMappingService.mapEnv('Simulation')).toBe('SIMULATION');
        });

        it('should map production correctly', () => {
            expect(ZatcaMappingService.mapEnv('production')).toBe('PRODUCTION');
        });

        it('should default to SANDBOX for unknown or sandbox roles', () => {
            expect(ZatcaMappingService.mapEnv('sandbox')).toBe('SANDBOX');
            expect(ZatcaMappingService.mapEnv('unknown')).toBe('SANDBOX');
            expect(ZatcaMappingService.mapEnv('')).toBe('SANDBOX');
        });
    });

    describe('mapStatusToFrontend', () => {
        it('should map CLEARED to Cleared', () => {
            expect(ZatcaMappingService.mapStatusToFrontend('CLEARED')).toBe('Cleared');
        });

        it('should map REPORTED to Reported', () => {
            expect(ZatcaMappingService.mapStatusToFrontend('REPORTED')).toBe('Reported');
        });

        it('should map FAILED to Failed', () => {
            expect(ZatcaMappingService.mapStatusToFrontend('FAILED')).toBe('Failed');
        });

        it('should map SUBMITTED to Reported', () => {
            expect(ZatcaMappingService.mapStatusToFrontend('SUBMITTED')).toBe('Reported');
        });

        it('should handle capitalize unknown statuses', () => {
            expect(ZatcaMappingService.mapStatusToFrontend('PENDING')).toBe('Pending');
        });
    });

    describe('mapInvoiceToFrontend', () => {
        it('should correctly transform a DB invoice object', () => {
            const mockDbInvoice = {
                id: 123,
                company_id: 1,
                uuid: 'uuid-1',
                invoice_number: 'INV-1',
                date: new Date('2026-01-01T10:00:00Z'),
                type: 'B2B',
                total_amount: '115.00',
                tax_amount: '15.00',
                status: 'CLEARED',
                qr_code: 'qr-data',
                xml_payload: '<xml></xml>',
                submission_response: JSON.stringify({ status: 'PASS' }),
                company: {
                    registered_name: 'Test Co',
                    vat_number: '300000000000003'
                },
                customer: {
                    name: 'Customer A',
                    vat_number: '123',
                    address: 'Street 1',
                    city: 'Riyadh',
                    country: 'SA'
                }
            };

            const result = ZatcaMappingService.mapInvoiceToFrontend(mockDbInvoice);
            
            expect(result.id).toBe('123');
            expect(result.invoiceSubtype).toBe('Standard');
            expect(result.totalAmount).toBe(115);
            expect(result.vatAmount).toBe(15);
            expect(result.taxExclusiveAmount).toBe(100);
            expect(result.status).toBe('Cleared');
            expect(result.customer.name).toBe('Customer A');
            expect(result.zatcaResponse.status).toBe('PASS');
        });

        it('should handle missing customer and malformed response gracefully', () => {
            const mockDbInvoice = {
                id: 124,
                company_id: 1,
                date: new Date(),
                submission_response: 'invalid-json',
                company: {}
            };

            const result = ZatcaMappingService.mapInvoiceToFrontend(mockDbInvoice);
            expect(result.customer.name).toBe('Unknown Customer');
            expect(result.zatcaResponse.status).toBe('ERROR');
        });
    });
});
