import crypto from 'crypto';
import prisma from '../lib/prisma.js';

class KeyRotationService {
    private intervalId: NodeJS.Timeout | null = null;
    private readonly ROTATION_DAYS = 90;
    private readonly CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // Check once a day

    public start() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        console.log('[KeyRotation] Service started. Will check for expired API keys daily.');
        
        // Run immediately on start, then daily
        this.checkAndRotateKeys();
        this.intervalId = setInterval(() => this.checkAndRotateKeys(), this.CHECK_INTERVAL_MS);
    }

    public stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('[KeyRotation] Service stopped.');
        }
    }

    private async checkAndRotateKeys() {
        try {
            console.log('[KeyRotation] Checking for ERP API keys that need rotation...');
            
            // 90 days ago
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - this.ROTATION_DAYS);

            // Find active ERP configurations older than 90 days
            const configsToCheck = await prisma.erp_configuration.findMany({
                where: {
                    is_active: true,
                    is_deleted: false,
                    updated_at: {
                        lt: cutoffDate
                    }
                },
                include: {
                    company: true
                }
            });

            let rotatedCount = 0;

            for (const config of configsToCheck) {
                // Check if the company has apiRotation enabled in its settings
                const settings = config.company.settings as any;
                const isRotationEnabled = settings?.security?.apiRotation === true;

                if (isRotationEnabled) {
                    console.log(`[KeyRotation] Rotating API key for ERP Config ${config.id} (Company: ${config.company.registered_name})`);
                    
                    const newApiKey = crypto.randomBytes(32).toString('hex');
                    
                    await prisma.erp_configuration.update({
                        where: { id: config.id },
                        data: {
                            api_key: newApiKey,
                            updated_at: new Date() // Reset the 90-day timer
                        }
                    });

                    // In a real production system, you would also notify the ERP admin 
                    // via email/webhook that their API key was rotated.
                    
                    rotatedCount++;
                }
            }

            if (rotatedCount > 0) {
                console.log(`[KeyRotation] Successfully rotated ${rotatedCount} API keys.`);
            } else {
                console.log('[KeyRotation] No API keys required rotation today.');
            }

        } catch (error) {
            console.error('[KeyRotation] Error during key rotation check:', error);
        }
    }
}

export default new KeyRotationService();
