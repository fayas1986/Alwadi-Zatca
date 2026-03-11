
import { Router } from 'express';
import { reportInvoice, clearInvoice } from '../services/zatcaService';
import { generateInvoiceXML, signInvoiceXML } from '../services/xmlService';
import { getPrisma } from '../lib/prisma';
import { decrypt } from '../utils/crypto';

const router = Router();
const prisma = getPrisma();

router.post('/report', async (req, res) => {
    try {
        const { invoice, vat, environment } = req.body;

        // Normalize environment to PascalCase (Simulation, Sandbox, Production)
        const normalizedEnv = environment 
            ? environment.charAt(0).toUpperCase() + environment.slice(1).toLowerCase()
            : 'Production';

        let company = await prisma.company.findUnique({
            where: {
                vatNumber_environment: {
                    vatNumber: vat,
                    environment: normalizedEnv
                }
            }
        });

        // Fallback: try direct matching if normalization failed to find it (for legacy data)
        if (!company && environment) {
            company = await prisma.company.findUnique({
                where: {
                    vatNumber_environment: {
                        vatNumber: vat,
                        environment: environment
                    }
                }
            });
        }

        console.log(`Lookup: vat=${vat}, env=${environment || 'Production'}, found=${!!company}`);

        if (!company) {
            console.error(`Company not found for VAT: ${vat} in environment: ${environment || 'Production'}`);
            throw new Error('Company not found');
        }

        // Generate XML
        const { xml, uuid } = generateInvoiceXML(invoice);

        // Sign
        const privateKey = decrypt(company.privateKey!);
        let cert = company.productionCSID!;
        if (!cert.includes('BEGIN CERTIFICATE')) {
            cert = `-----BEGIN CERTIFICATE-----\n${cert}\n-----END CERTIFICATE-----`;
        }

        const { signedXml, invoiceHash, qr } = await signInvoiceXML(xml, cert, privateKey);

        // Submit
        const secret = decrypt(company.productionSecret!);
        let result;

        if (invoice.invoiceSubtype === 'Standard') {
            result = await clearInvoice(company.environment as any, company.productionCSID!, secret, invoiceHash, Buffer.from(signedXml).toString('base64'), uuid);
        } else {
            result = await reportInvoice(company.environment as any, company.productionCSID!, secret, invoiceHash, Buffer.from(signedXml).toString('base64'), uuid);
        }

        // Save
        await prisma.invoice.create({
            data: {
                invoiceNumber: invoice.invoiceNumber,
                issueDate: new Date(invoice.issueDate),
                totalAmount: invoice.totalAmount,
                uuid: uuid,
                hash: invoiceHash,
                qrCode: qr,
                xml: signedXml,
                status: (result.reportingStatus === 'REPORTED' || result.clearanceStatus === 'CLEARED') ? 'Reported' : 'Failed',
                zatcaResponse: result,
                companyId: company.id
            }
        });

        res.json(result);
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
