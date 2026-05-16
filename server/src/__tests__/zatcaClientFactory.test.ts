
import { describe, it, expect, vi } from 'vitest';
import { ZatcaClientFactory } from '../clients/zatca/ZatcaClientFactory.js';
import { ProductionClient } from '../clients/zatca/ProductionClient.js';
import { SimulationClient } from '../clients/zatca/SimulationClient.js';
import { SandboxClient } from '../clients/zatca/SandboxClient.js';

describe('ZatcaClientFactory', () => {
    it('should create ProductionClient for production environment', () => {
        const originalMockSdk = process.env.USE_MOCK_SDK;
        process.env.USE_MOCK_SDK = 'false';
        const client = ZatcaClientFactory.getClient('production');
        expect(client).toBeInstanceOf(ProductionClient);
        process.env.USE_MOCK_SDK = originalMockSdk;
    });

    it('should create SimulationClient for simulation environment', () => {
        const originalMockSdk = process.env.USE_MOCK_SDK;
        process.env.USE_MOCK_SDK = 'false';
        const client = ZatcaClientFactory.getClient('simulation');
        expect(client).toBeInstanceOf(SimulationClient);
        process.env.USE_MOCK_SDK = originalMockSdk;
    });

    it('should create SandboxClient for sandbox environment', () => {
        const originalMockSdk = process.env.USE_MOCK_SDK;
        process.env.USE_MOCK_SDK = 'false';
        const client = ZatcaClientFactory.getClient('sandbox');
        expect(client).toBeInstanceOf(SandboxClient);
        process.env.USE_MOCK_SDK = originalMockSdk;
    });

    it('should return a MockClient if USE_MOCK_SDK is enabled', () => {
        // We can test this by temporarily setting env or just trust the logic if it was already tested
        // But better to mock process.env if possible
        const originalMockSdk = process.env.USE_MOCK_SDK;
        process.env.USE_MOCK_SDK = 'true';
        
        // We need to re-import or handle the factory's internal state if it caches
        // Let's assume it doesn't cache for now or handles it
        const client = ZatcaClientFactory.getClient('production');
        // Based on implementation_plan, it should return a MockClient
        expect(client.constructor.name).toBe('MockClient');
        
        process.env.USE_MOCK_SDK = originalMockSdk;
    });

    it('should default to SandboxClient for unknown environments', () => {
        const originalMockSdk = process.env.USE_MOCK_SDK;
        process.env.USE_MOCK_SDK = 'false';
        const client = ZatcaClientFactory.getClient('unknown');
        expect(client).toBeInstanceOf(SandboxClient);
        process.env.USE_MOCK_SDK = originalMockSdk;
    });
});
