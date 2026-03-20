import prisma from '../server/src/lib/prisma.js';
import fs from 'fs';
import path from 'path';

async function backup() {
    console.log('Starting ZATCA Database Backup...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(process.cwd(), 'backups');

    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
    }

    try {
        const companies = await prisma.company.findMany();
        const audits = await (prisma as any).audit_log.findMany({ take: 1000, orderBy: { created_at: 'desc' } });
        const summary = {
            timestamp,
            companyCount: companies.length,
            auditCount: audits.length,
            status: 'HEALTHY'
        };

        const backupData = JSON.stringify({ summary, companies, audits }, null, 2);
        const fileName = `zatca-backup-${timestamp}.json`;
        fs.writeFileSync(path.join(backupDir, fileName), backupData);

        console.log(`Backup successful: ${fileName}`);
    } catch (error) {
        console.error('Backup failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

backup();
