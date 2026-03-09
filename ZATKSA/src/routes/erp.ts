
import { Router } from 'express';
import { getPrisma } from '../lib/prisma';
import { runSync } from '../jobs/syncWorker';

const router = Router();
const prisma = getPrisma();

router.post('/config', async (req, res) => {
    try {
        const { companyId, type, baseUrl, apiKey, username, password, syncInterval } = req.body;

        const config = await prisma.eRPConfig.upsert({
            where: { companyId },
            update: {
                type,
                baseUrl,
                apiKey,
                username,
                password,
                syncInterval: syncInterval || 30,
                isActive: true
            },
            create: {
                companyId,
                type,
                baseUrl,
                apiKey,
                username,
                password,
                syncInterval: syncInterval || 30
            }
        });

        res.json({ success: true, data: config });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/sync', async (req, res) => {
    try {
        await runSync();
        res.json({ success: true, message: 'Sync triggered successfully' });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
