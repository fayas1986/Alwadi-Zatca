import prisma from '../lib/prisma.js';
import { fetchAndProcessInvoices } from './integrationService.js';

export class SyncService {
    private static interval: NodeJS.Timeout | null = null;
    private static activeSyncs = new Set<string>();

    static start() {
        if (this.interval) return;

        console.log('[Sync] Starting automated ERP sync service...');
        
        // Schedule for every 1 hour (3600 seconds) for production efficiency
        const INTERVAL_MS = parseInt(process.env.ERP_SYNC_INTERVAL_MS || '3600000', 10);
        
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

            const activeConfigs = await prisma.erp_configuration.findMany({
                where: whereClause,
                include: { company: true }
            });

            console.log(`[Sync] Found ${activeConfigs.length} active ERP configurations.`);

            for (const config of activeConfigs) {
                try {
                    if (!config.base_url) {
                        console.warn(`[Sync] Skipping sync for ${config.company.registered_name} - No base_url configured.`);
                        summary.push({ company: config.company.registered_name, status: 'skipped', reason: 'No base_url' });
                        continue;
                    }

                    console.log(`[Sync] Pulling for ${config.company.registered_name} (${config.environment || 'PRODUCTION'})...`);
                    const results = await fetchAndProcessInvoices(
                        config.base_url,
                        config.api_key || '',
                        config.company.vat_number,
                        config.environment || undefined
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
