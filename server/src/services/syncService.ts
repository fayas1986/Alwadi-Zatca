import prisma from '../lib/prisma.js';
import { fetchAndProcessInvoices } from './integrationService.js';

export class SyncService {
    private static interval: NodeJS.Timeout | null = null;
    private static isSyncing = false;

    static start() {
        if (this.interval) return;

        console.log('[Sync] Starting automated ERP sync service...');
        
        // Run immediately on start
        this.runSync().catch(err => console.error('[Sync] Initial run failed:', err));

        // Schedule for every 30 seconds for near real-time updates
        this.interval = setInterval(() => {
            this.runSync().catch(err => console.error('[Sync] Scheduled run failed:', err));
        }, 30 * 1000);
    }

    static stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            console.log('[Sync] Automated ERP sync service stopped.');
        }
    }

    private static async runSync() {
        if (this.isSyncing) {
            console.warn('[Sync] Sync already in progress, skipping...');
            return;
        }

        this.isSyncing = true;
        console.log('[Sync] Starting periodic ERP pull for all active configs...');

        try {
            const activeConfigs = await prisma.erp_configuration.findMany({
                where: { is_active: true },
                include: { company: true }
            });

            console.log(`[Sync] Found ${activeConfigs.length} active ERP configurations.`);

            for (const config of activeConfigs) {
                try {
                    // Skip local mock URLs to prevent unnecessary mock generation
                    const isLocal = config.base_url.includes('localhost') || config.base_url.includes('127.0.0.1');
                    if (isLocal && config.base_url !== '') {
                        console.warn(`[Sync] Skipping local mock sync for ${config.company.registered_name} (${config.base_url})`);
                        continue;
                    }

                    if (!config.base_url) {
                        console.warn(`[Sync] Skipping sync for ${config.company.registered_name} - No base_url configured.`);
                        continue;
                    }

                    console.log(`[Sync] Pulling for ${config.company.registered_name} (${config.environment || 'PRODUCTION'})...`);
                    const results = await fetchAndProcessInvoices(
                        config.base_url,
                        config.api_key || '',
                        config.company.vat_number,
                        config.environment || undefined
                    );
                    console.log(`[Sync] Successfully processed ${results.length} invoices for ${config.company.registered_name}.`);
                } catch (configErr: any) {
                    console.error(`[Sync] Failed to pull for company ${config.company.registered_name}:`, configErr.message);
                }
            }
        } catch (err: any) {
            console.error('[Sync] Error during ERP sync loop:', err.message);
        } finally {
            this.isSyncing = false;
            console.log('[Sync] Periodic ERP pull completed.');
        }
    }
}

export default SyncService;
