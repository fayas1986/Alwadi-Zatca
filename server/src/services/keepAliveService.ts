import prisma from '../lib/prisma.js';

export class KeepAliveService {
    private static interval: NodeJS.Timeout | null = null;
    private static isRunning = false;

    /**
     * Start the background keep-alive heartbeat.
     * Pings the database every 45 seconds (`SELECT 1`) to ensure Neon / serverless Postgres compute
     * NEVER goes to sleep ("suspends") and TCP connection sockets remain active.
     */
    public static start() {
        if (this.isRunning) return;
        this.isRunning = true;

        console.log('[KeepAlive] Starting database keep-alive heartbeat (interval: 45s)...');

        // Immediate initial ping on boot to warm up any sleeping instance
        this.pingDatabase().catch(err => {
            console.error('[KeepAlive] Initial warmup ping error:', err.message?.split('\n')[0]);
        });

        // Periodic ping every 45 seconds (Neon serverless compute sleeps after 300 seconds of inactivity)
        this.interval = setInterval(() => {
            this.pingDatabase().catch(err => {
                console.error('[KeepAlive] Heartbeat ping error:', err.message?.split('\n')[0]);
            });
        }, 45 * 1000);
    }

    /**
     * Execute a lightweight `SELECT 1` query against the database.
     * If the socket connection was dropped or timed out, automatically reconnect.
     */
    public static async pingDatabase(): Promise<boolean> {
        try {
            await prisma.$queryRaw`SELECT 1`;
            return true;
        } catch (error: any) {
            const msg = error?.message?.split('\n')[0] || 'Unknown error';
            console.warn(`[KeepAlive] Database ping failed (${msg}). Attempting automatic connection recovery...`);
            try {
                await prisma.$disconnect();
                await prisma.$connect();
                await prisma.$queryRaw`SELECT 1`;
                console.log('[KeepAlive] Database successfully reconnected and warmed up.');
                return true;
            } catch (reconnectError: any) {
                const recMsg = reconnectError?.message?.split('\n')[0] || 'Unknown reconnect error';
                console.error(`[KeepAlive] Automatic connection recovery failed: ${recMsg}`);
                return false;
            }
        }
    }

    /**
     * Stop the background keep-alive service.
     */
    public static stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.isRunning = false;
        console.log('[KeepAlive] Database keep-alive heartbeat stopped.');
    }
}

export default KeepAliveService;
