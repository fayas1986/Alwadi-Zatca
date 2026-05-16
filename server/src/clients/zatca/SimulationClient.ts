
import { ProductionClient } from './ProductionClient.js';

export class SimulationClient extends ProductionClient {
    protected baseUrl = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation';

    // Simulation currently uses the same logic as Production but on different endpoints.
    // If simulation-specific bypasses or behavior are needed, they should be implemented here.
}
