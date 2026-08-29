
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { generateCSR, signInvoice } from './sdkService.js';
import { ZatcaClientFactory } from '../clients/zatca/ZatcaClientFactory.js';
import { generateInvoiceXML } from './xmlService.js';
import { SecurityService } from './securityService.js';
import { AuditService } from './auditService.js';
import { logZatcaActivity } from '../utils/zatcaUtils.js';
import { ZatcaMappingService } from './zatcaMappingService.js';

export class ComplianceService {
    /**
     * Orchestrates the onboarding workflow for a company
     */
    static async onboard(onboardData: any, userContext: { email: string; role: string; ip: string }) {
        const {
            vat, otp, companyName, commonName, branchName,
            location, industry, invoiceType, serialNumber, tin,
            buildingNumber, streetName, citySubdivision, postalZone, city
        } = onboardData;

        const rawEnv = onboardData.environment || 'Simulation';
        const environment = rawEnv.charAt(0).toUpperCase() + rawEnv.slice(1).toLowerCase();

        console.log(`[Compliance Service] New onboarding request: Env=${environment}, VAT=${vat}`);

        const client = ZatcaClientFactory.getClient(environment as any);

        // 1. Generate CSR and Private Key
        const orgIdentifier = (tin && /^\d+$/.test(tin)) ? tin : vat;
        const numericTIN = (tin && /^\d{10}$/.test(tin)) ? tin : vat.substring(0, 10);
        const formattedSerial = serialNumber?.includes('|')
            ? serialNumber
            : `1-ZatcaConnect|2-Desktop|3-${serialNumber || crypto.randomUUID()}`;

        const csrConfig = `csr.common.name=${commonName || companyName}
csr.serial.number=${formattedSerial}
csr.organization.identifier=${vat}
csr.organization.unit.name=${numericTIN}
csr.organization.name=${numericTIN}
csr.country.name=SA
csr.invoice.type=${invoiceType || '1100'}
csr.location.address=${location || 'Riyadh'}
csr.industry.business.category=${industry || 'IT'}`;

        let csr, privateKey;
        const isSimulation = environment === 'Simulation';
        
        // Use real SDK if not in mock mode or if we specifically want to test Simulation connectivity
        if (process.env.USE_MOCK_SDK === 'true' && !onboardData.forceRealSimulation) {
            csr = 'MOCK_CSR_CONTENT';
            privateKey = 'MOCK_PRIVATE_KEY_SIM';
        } else {
            const result = await generateCSR(csrConfig, isSimulation);
            csr = result.csr;
            privateKey = result.privateKey;
        }

        // 2. Obtain Compliance CSID (OTP exchange)
        const complianceResult = await client.onboard({
            csr,
            otp
        });

        const complianceCSID = complianceResult.binarySecurityToken;
        const complianceSecret = complianceResult.secret;

        // 3. Compliance Checks (Signing & Testing)
        const sampleInvoice = {
            invoiceNumber: 'COMPLIANCE-001',
            uuid: crypto.randomUUID(),
            issueDate: new Date().toISOString(),
            invoiceSubtype: 'Standard',
            invoiceCounterValue: 1,
            documentType: 'Invoice',
            currencyCode: 'SAR',
            supplier: { 
                name: numericTIN, 
                vatNumber: vat, 
                address: { 
                    streetName: streetName || 'Test Street', 
                    buildingNumber: buildingNumber || '1111', 
                    citySubdivisionName: citySubdivision || 'District', 
                    cityName: city || location || 'Riyadh', 
                    postalZone: postalZone || '11111', 
                    countryCode: 'SA' 
                } 
            },
            customer: { 
                name: 'Test Customer', 
                vatNumber: '300000000000003', 
                address: { 
                    streetName: 'Test Street', 
                    buildingNumber: '1111', 
                    citySubdivisionName: 'District', 
                    cityName: 'Riyadh', 
                    postalZone: '11111', 
                    countryCode: 'SA' 
                } 
            },
            items: [{ name: 'Test Item', quantity: 1, unitPrice: 100, subtotal: 100, taxCategory: 'S', vatRate: 0.15, vatAmount: 15, total: 115 }],
            totalAmount: 115, 
            vatAmount: 15, 
            taxExclusiveAmount: 100
        };

        // 3a. Standard Invoice Compliance Check
        const xmlStandard = await (generateInvoiceXML as any)(sampleInvoice);
        const signedStandard = await signInvoice(xmlStandard, complianceCSID.trim(), privateKey, true);

        await client.checkCompliance({
            csid: complianceCSID,
            secret: complianceSecret,
            xmlHash: signedStandard.hash,
            xmlBase64: Buffer.from(signedStandard.signedXml).toString('base64'),
            uuid: sampleInvoice.uuid
        });

        // 3b. Simplified Invoice Compliance Check (Mandatory for most retailers)
        const simplifiedInvoice = { 
            ...sampleInvoice, 
            invoiceNumber: 'COMPLIANCE-002', 
            uuid: crypto.randomUUID(), 
            invoiceSubtype: 'Simplified',
            invoiceCounterValue: 2,
            previousInvoiceHash: signedStandard.hash
        };
        const xmlSimplified = await (generateInvoiceXML as any)(simplifiedInvoice);
        const signedSimplified = await signInvoice(xmlSimplified, complianceCSID.trim(), privateKey, true);

        await client.checkCompliance({
            csid: complianceCSID,
            secret: complianceSecret,
            xmlHash: signedSimplified.hash,
            xmlBase64: Buffer.from(signedSimplified.signedXml).toString('base64'),
            uuid: simplifiedInvoice.uuid
        });

        // 4. Request Production CSID
        const prodResult = await client.requestProductionCSID({
            complianceCSID: complianceCSID,
            complianceSecret: complianceSecret,
            requestId: complianceResult.requestID
        });

        // 5. Update Database in Transaction
        const { company, user } = await prisma.$transaction(async (tx) => {
            const dbEnv = ZatcaMappingService.mapEnv(environment) as any;
            let user = await tx.user.findFirst();
            if (!user) {
                user = await tx.user.create({
                    data: {
                        id: crypto.randomUUID(),
                        email: 'admin@zatca-fatoora.com',
                        company_name: companyName
                    }
                });
            }

            const company = await tx.company.upsert({
                where: { vat_number: vat },
                update: {
                    registered_name: companyName,
                    branch_name: branchName,
                    building_number: buildingNumber,
                    street_name: streetName,
                    city_subdivision: citySubdivision,
                    postal_zone: postalZone,
                    city: city || location,
                    environment: dbEnv,
                    user: { connect: { id: user.id } }
                },
                create: {
                    vat_number: vat,
                    registered_name: companyName,
                    branch_name: branchName,
                    building_number: buildingNumber,
                    street_name: streetName,
                    city_subdivision: citySubdivision,
                    postal_zone: postalZone,
                    city: city || location,
                    environment: dbEnv,
                    user: { connect: { id: user.id } },
                    cr_number: '1234567890'
                }
            });

            const existingCert = await tx.certificate.findFirst({
                where: {
                    company_id: company.id,
                    common_name: commonName,
                    type: dbEnv
                }
            });

            await (tx.certificate as any).upsert({
                where: { id: existingCert?.id || 0 },
                update: {
                    type: dbEnv,
                    common_name: commonName,
                    certificate: prodResult.binarySecurityToken,
                    private_key: SecurityService.encrypt(privateKey),
                    csid: prodResult.binarySecurityToken,
                    secret: SecurityService.encrypt(prodResult.secret),
                    is_active: true
                },
                create: {
                    company: { connect: { id: company.id } },
                    type: dbEnv,
                    common_name: commonName,
                    certificate: prodResult.binarySecurityToken,
                    private_key: SecurityService.encrypt(privateKey),
                    csid: prodResult.binarySecurityToken,
                    secret: SecurityService.encrypt(prodResult.secret),
                    is_active: true
                }
            });

            return { company, user };
        });

        await logZatcaActivity({
            action: 'Solution Onboarded',
            status: 'Success',
            details: `Company ${companyName} (${vat}) successfully onboarded to ${environment}`,
            user: userContext.email,
            role: userContext.role,
            ipAddress: userContext.ip,
            resourceId: vat,
            metadata: { companyId: company.id, environment }
        });

        return { success: true, companyId: company.id };
    }

    /**
     * Renews the production CSID
     */
    static async renew(vat: string, otp: string, environment: string, userContext: { email: string; role: string; ip: string }) {
        const company = await prisma.company.findUnique({
            where: { vat_number: vat },
            include: { certificates: true }
        });

        if (!company) throw new Error('Company not found');

        const cert = company.certificates.find((c: any) => c.is_active);
        if (!cert) throw new Error('Active certificate not found');

        const currentCSID = cert.csid!;
        const currentSecret = SecurityService.decrypt(cert.secret!);

        const client = ZatcaClientFactory.getClient(environment as any);
        const newProdResult = await client.renewProductionCSID({
            csid: currentCSID,
            secret: currentSecret,
            otp
        });

        await prisma.certificate.update({
            where: { id: cert.id },
            data: {
                certificate: newProdResult.binarySecurityToken,
                csid: newProdResult.binarySecurityToken,
                secret: SecurityService.encrypt(newProdResult.secret),
            }
        });

        await logZatcaActivity({
            action: 'Certificate Renewed',
            status: 'Success',
            details: `Certificate for ${company.registered_name} (${vat}) successfully renewed`,
            user: userContext.email,
            role: userContext.role,
            ipAddress: userContext.ip,
            resourceId: vat
        });

        return { success: true };
    }
}
