import prisma from '../lib/prisma.js';
import { fetchAndProcessInvoices } from './integrationService.js';
import { D365Service } from './d365Service.js';

export class SyncService {
    private static interval: NodeJS.Timeout | null = null;
    private static activeSyncs = new Set<string>();

    static start() {
        if (this.interval) return;

        console.log('[Sync] Starting automated ERP sync service...');
        
        // Schedule for every 2 minutes (120000 ms) for real-time responsiveness
        const INTERVAL_MS = parseInt(process.env.ERP_SYNC_INTERVAL_MS || '120000', 10);
        
        // Run immediately on start
        this.runSync().catch(err => console.error('[Sync] Initial run failed:', err));

        this.interval = setInterval(() => {
            this.runSync().catch(err => console.error('[Sync] Scheduled run failed:', err));
        }, INTERVAL_MS);
    }

    static stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            console.log('[Sync] Automated ERP sync service stopped.');
        }
    }

    /**
     * Executes the ERP synchronization loop.
     * Can now be called manually from API routes.
     */
    static async runSync(configId?: string) {
        const lockKey = configId || '_GLOBAL_';

        if (this.activeSyncs.has('_GLOBAL_') || this.activeSyncs.has(lockKey)) {
            console.warn(`[Sync] Sync for ${lockKey} already in progress, skipping...`);
            return { status: 'rejected', message: 'Sync already in progress' };
        }

        this.activeSyncs.add(lockKey);
        const summary: any[] = [];
        console.log(`[Sync] Starting ERP pull for ${configId ? 'config ID ' + configId : 'all active configs'}...`);

        try {
            const whereClause: any = { is_active: true };
            if (configId) whereClause.id = configId;

            const allConfigs = await prisma.erp_configuration.findMany({
                where: whereClause,
                include: { company: true }
            });

            // De-duplicate: If multiple config records point to the same physical system, only sync once.
            // Key = CompanyID + BaseURL + Environment
            const activeConfigs = Array.from(
                new Map(
                    allConfigs.map(c => [
                        `${c.company_id}-${(c.base_url || '').toLowerCase().trim()}-${(c.environment || 'PRODUCTION').toUpperCase()}`, 
                        c
                    ])
                ).values()
            );

            console.log(`[Sync] Found ${allConfigs.length} config records, processing ${activeConfigs.length} unique endpoints.`);

            for (const config of activeConfigs) {
                try {
                    if (!config.base_url) {
                        console.warn(`[Sync] Skipping sync for ${config.company.registered_name} - No base_url configured.`);
                        summary.push({ company: config.company.registered_name, status: 'skipped', reason: 'No base_url' });
                        continue;
                    }

                    console.log(`[Sync] Pulling for ${config.company.registered_name} (${config.environment || 'PRODUCTION'})...`);
                    
                    let preFetchedInvoices: any[] | undefined = undefined;
                    if (config.type === 'D365' || (config.type === 'MICROSOFT' && !config.base_url.includes('mock-server'))) {
                        console.log(`[Sync] D365 configuration detected (${config.type}). Fetching invoices via D365Service...`);
                        const d365Config = {
                            clientId: process.env.D365_CLIENT_ID || '',
                            clientSecret: process.env.D365_CLIENT_SECRET || config.api_key || '',
                            tenantId: process.env.D365_TENANT_ID || 'common',
                            baseUrl: config.base_url
                        };
                        try {
                            preFetchedInvoices = await D365Service.fetchInvoices(d365Config);
                        } catch (err: any) {
                            console.error(`[Sync] Failed to fetch from D365:`, err.message);
                            throw err;
                        }
                    }

                    const results = await fetchAndProcessInvoices(
                        config.base_url,
                        config.api_key || '',
                        config.company.vat_number,
                        config.environment || undefined,
                        preFetchedInvoices
                    );
                    
                    summary.push({ 
                        company: config.company.registered_name, 
                        status: 'success', 
                        invoiceCount: results.length 
                    });
                    
                    console.log(`[Sync] Successfully processed ${results.length} invoices for ${config.company.registered_name}.`);
                } catch (configErr: any) {
                    console.error(`[Sync] Failed to pull for company ${config.company.registered_name}:`, configErr.message);
                    summary.push({ 
                        company: config.company.registered_name, 
                        status: 'failed', 
                        error: configErr.message 
                    });
                }
            }
            return { status: 'completed', summary };
        } catch (err: any) {
            console.error('[Sync] Error during ERP sync loop:', err.message);
            return { status: 'error', error: err.message };
        } finally {
            this.activeSyncs.delete(lockKey);
            console.log(`[Sync] ERP pull for ${lockKey} completed.`);
        }
    }
}

export default SyncService;
