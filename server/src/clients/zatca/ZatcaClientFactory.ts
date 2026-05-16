
import { IZatcaClient } from './IZatcaClient.js';
import { ProductionClient } from './ProductionClient.js';
import { SimulationClient } from './SimulationClient.js';
import { SandboxClient } from './SandboxClient.js';
import { MockClient } from './MockClient.js';

export class ZatcaClientFactory {
    /**
     * Determine if the system should operate in Mock mode
     */
    static isMockMode(): boolean {
        return process.env.USE_MOCK_SDK === 'true' || 
               (process.env.VERCEL === '1' && process.env.JAVA_EXE_PATH === undefined);
    }

    /**
     * Get the appropriate ZATCA client for the given environment
     */
    static getClient(env: string): IZatcaClient {
        if (this.isMockMode()) {
            return new MockClient();
        }

        switch (env.toUpperCase()) {
            case 'PRODUCTION':
                return new ProductionClient();
            case 'SIMULATION':
                return new SimulationClient();
            case 'SANDBOX':
            default:
                return new SandboxClient();
        }
    }
}
