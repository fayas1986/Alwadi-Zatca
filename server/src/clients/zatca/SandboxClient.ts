
import { ProductionClient } from './ProductionClient.js';

export class SandboxClient extends ProductionClient {
    protected baseUrl = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal';

    // Developer Portal / Sandbox uses similar logic to Production/Simulation
}
