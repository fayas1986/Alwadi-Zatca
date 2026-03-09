
import { getPrisma } from '../lib/prisma';
import { getConnector } from '../services/erpService';
import { reportInvoice, clearInvoice } from '../services/zatcaService';
import { generateInvoiceXML, signInvoiceXML } from '../services/xmlService';
import { decrypt } from '../utils/crypto';

const prisma = getPrisma();

export const runSync = async () => {
    console.log('--- STARTING ERP SYNC JOB ---');
    try {
        const erpConfigs = await prisma.eRPConfig.findMany({
            where: { isActive: true },
            include: { company: true }
        });

        for (const config of erpConfigs) {
            await syncCompanyInvoices(config);
        }
    } catch (e) {
        console.error('Sync job failed', e);
    }
};

async function syncCompanyInvoices(config: any) {
    const connector = getConnector(config);
    if (!connector) return;

    try {
        const pendingInvoices = await connector.fetchPendingInvoices();
        console.log(`Found ${pendingInvoices.length} pending invoices for ${config.company.name}`);

        for (const erpInv of pendingInvoices) {
            try {
                // Check if already exists
                const existing = await prisma.invoice.findUnique({
                    where: { invoiceNumber: erpInv.invoiceNumber }
                });
                if (existing) continue;

                // 1. Generate XML
                const { xml, uuid } = generateInvoiceXML(erpInv as any);

                // 2. Sign
                const privateKey = decrypt(config.company.privateKey!);
                let cert = config.company.productionCSID!;
                if (!cert.includes('BEGIN CERTIFICATE')) {
                    cert = `-----BEGIN CERTIFICATE-----\n${cert}\n-----END CERTIFICATE-----`;
                }

                const { signedXml, invoiceHash, qr } = await signInvoiceXML(xml, cert, privateKey);

                // 3. Submit to ZATCA
                const secret = decrypt(config.company.productionSecret!);
                let result;
                if (erpInv.invoiceSubtype === 'Standard') {
                    result = await clearInvoice(config.company.environment as any, config.company.productionCSID!, secret, invoiceHash, Buffer.from(signedXml).toString('base64'), uuid);
                } else {
                    result = await reportInvoice(config.company.environment as any, config.company.productionCSID!, secret, invoiceHash, Buffer.from(signedXml).toString('base64'), uuid);
                }

                const status = (result.reportingStatus === 'REPORTED' || result.clearanceStatus === 'CLEARED') ? 'Reported' : 'Failed';

                // 4. Save locally
                await prisma.invoice.create({
                    data: {
                        invoiceNumber: erpInv.invoiceNumber,
                        issueDate: new Date(erpInv.issueDate),
                        totalAmount: erpInv.totalAmount,
                        uuid: uuid,
                        hash: invoiceHash,
                        qrCode: qr,
                        xml: signedXml,
                        status: status,
                        zatcaResponse: result,
                        companyId: config.companyId
                    }
                });

                // 5. Push status back to ERP
                await connector.pushStatus(erpInv.invoiceNumber, status, result);

            } catch (invErr) {
                console.error(`Failed to process invoice ${erpInv.invoiceNumber}`, invErr);
            }
        }

        // Update last sync time
        await prisma.eRPConfig.update({
            where: { id: config.id },
            data: { lastSyncAt: new Date() }
        });

    } catch (e) {
        console.error(`Sync failed for company ${config.company.name}`, e);
    }
}
