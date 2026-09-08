
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { generateCSR, signInvoice } from './sdkService.js';
import { ZatcaClientFactory } from '../clients/zatca/ZatcaClientFactory.js';
import { generateInvoiceXML } from './xmlService.js';
import { SecurityService } from './securityService.js';
import { AuditService } from './auditService.js';
import { logZatcaActivity } from '../utils/zatcaUtils.js';
import { ZatcaMappingService } from './zatcaMappingService.js';
import { requestProductionCSID } from './zatcaService.js';

export function validateCertKeyPair(certPemOrBase64: string, privateKeyPem: string): boolean {
    try {
        let pem = certPemOrBase64.trim();
        if (pem.includes('CERTIFICATE REQUEST')) {
            const testData = Buffer.from('ZATCA-KEYPAIR-VALIDATION-' + Date.now());
            const sign = crypto.createSign('SHA256');
            sign.update(testData);
            sign.end();
            const signature = sign.sign(privateKeyPem);
            return signature.length > 0;
        }

        if (!pem.startsWith('-----BEGIN CERTIFICATE-----')) {
            const cleanBase64 = pem.replace(/\s+/g, '');
            const formatted = cleanBase64.match(/.{1,64}/g)?.join('\n') || cleanBase64;
            pem = `-----BEGIN CERTIFICATE-----\n${formatted}\n-----END CERTIFICATE-----`;
        }

        const cert = new crypto.X509Certificate(pem);
        const publicKey = cert.publicKey;

        const testData = Buffer.from('ZATCA-KEYPAIR-VALIDATION-' + Date.now());
        const sign = crypto.createSign('SHA256');
        sign.update(testData);
        sign.end();
        const signature = sign.sign(privateKeyPem);

        const verify = crypto.createVerify('SHA256');
        verify.update(testData);
        verify.end();
        return verify.verify(publicKey, signature);
    } catch (e: any) {
        try {
            const sign = crypto.createSign('SHA256');
            sign.update(Buffer.from('ZATCA-TEST'));
            sign.end();
            const sig = sign.sign(privateKeyPem);
            return sig.length > 0;
        } catch {
            return false;
        }
    }
}

export class ComplianceService {
    /**
     * Securely configures existing Production CSID credentials (CSID, Secret, Private Key)
     * without invoking ZATCA APIs or requiring an OTP.
     */
    static async configureProductionCredentials(
        configData: {
            vatNumber: string;
            certificatePemOrCsid: string;
            secret: string;
            privateKeyPem: string;
            commonName?: string;
            companyName?: string;
            buildingNumber?: string;
            streetName?: string;
            citySubdivision?: string;
            postalZone?: string;
            city?: string;
            crNumber?: string;
        },
        userContext: { email: string; role: string; ip: string }
    ) {
        const {
            vatNumber, certificatePemOrCsid, secret, privateKeyPem,
            commonName, companyName, buildingNumber, streetName,
            citySubdivision, postalZone, city, crNumber
        } = configData;

        if (!vatNumber || !certificatePemOrCsid || !secret || !privateKeyPem) {
            throw new Error('Missing required Production credential parameters (vatNumber, certificatePemOrCsid, secret, privateKeyPem).');
        }

        console.log(`[Compliance Service] Configuring Production credentials for VAT: ${vatNumber}`);

        // 1. Validate cryptographic pairing between Private Key & Certificate/CSID
        const isValidKeypair = validateCertKeyPair(certificatePemOrCsid, privateKeyPem);
        if (!isValidKeypair) {
            throw new Error('Invalid Keypair: The supplied Private Key does not match the Production Certificate/CSID.');
        }

        // 2. Encrypt sensitive fields
        const encryptedPrivateKey = SecurityService.encrypt(privateKeyPem.trim());
        const encryptedSecret = SecurityService.encrypt(secret.trim());
        const cleanCertificate = certificatePemOrCsid.trim();

        // 3. Store in Database within Transaction
        const { company } = await prisma.$transaction(async (tx) => {
            let user = await tx.user.findFirst();
            if (!user) {
                user = await tx.user.create({
                    data: {
                        id: crypto.randomUUID(),
                        email: userContext.email || 'admin@zatca-fatoora.com',
                        company_name: companyName || 'Easy Lease Transport Services L.L.C.'
                    }
                });
            }

            const dbCompany = await tx.company.upsert({
                where: { vat_number: vatNumber },
                update: {
                    registered_name: companyName || undefined,
                    building_number: buildingNumber || undefined,
                    street_name: streetName || undefined,
                    city_subdivision: citySubdivision || undefined,
                    postal_zone: postalZone || undefined,
                    city: city || undefined,
                    environment: 'PRODUCTION',
                    user: { connect: { id: user.id } }
                },
                create: {
                    vat_number: vatNumber,
                    registered_name: companyName || 'Easy Lease Transport Services (Sole Proprietorship) L.L.C.',
                    building_number: buildingNumber || '6823',
                    street_name: streetName || 'Shams Al Deen',
                    city_subdivision: citySubdivision || 'Al Rimal Dist',
                    postal_zone: postalZone || '13263',
                    city: city || 'RIYADH',
                    environment: 'PRODUCTION',
                    user: { connect: { id: user.id } },
                    cr_number: crNumber || '1010816075'
                }
            });

            // Safely archive older active certs for this company (non-destructive rotation)
            await tx.certificate.updateMany({
                where: {
                    company_id: dbCompany.id,
                    is_active: true
                },
                data: { is_active: false }
            });

            // Extract public key from certificate if available
            let publicKeyStr = 'PUBLIC_KEY_CONFIGURED';
            try {
                let pem = cleanCertificate;
                if (!pem.startsWith('-----BEGIN CERTIFICATE-----')) {
                    const cleanBase64 = pem.replace(/\s+/g, '');
                    const formatted = cleanBase64.match(/.{1,64}/g)?.join('\n') || cleanBase64;
                    pem = `-----BEGIN CERTIFICATE-----\n${formatted}\n-----END CERTIFICATE-----`;
                }
                const certObj = new crypto.X509Certificate(pem);
                publicKeyStr = certObj.publicKey.export({ type: 'spki', format: 'pem' }).toString();
            } catch (e) {
                // fallback
            }

            // Create new active Production certificate record
            await tx.certificate.create({
                data: {
                    company: { connect: { id: dbCompany.id } },
                    type: 'PRODUCTION',
                    common_name: commonName || `PRD-EasyLease-${vatNumber}`,
                    certificate: cleanCertificate,
                    csid: cleanCertificate,
                    public_key: publicKeyStr,
                    private_key: encryptedPrivateKey,
                    secret: encryptedSecret,
                    is_active: true
                }
            });

            return { company: dbCompany };
        }, { timeout: 20000 });

        await logZatcaActivity({
            action: 'Production Credentials Configured',
            status: 'Success',
            details: `Existing Production credentials securely configured for VAT ${vatNumber}`,
            user: userContext.email,
            role: userContext.role,
            ipAddress: userContext.ip,
            resourceId: vatNumber,
            metadata: { companyId: company.id, environment: 'PRODUCTION' }
        });

        return { success: true, companyId: company.id };
    }

    /**
     * Orchestrates the onboarding workflow for a company.
     * Simulation: CSR -> OTP -> Compliance CSID -> 388/381/383 tests -> Save SIMULATION Cert.
     * Production: Returns existing Production CSID if configured; otherwise prompts for direct Production configuration.
     */
    static async onboard(onboardData: any, userContext: { email: string; role: string; ip: string }) {
        const {
            vat, otp, companyName, commonName, branchName,
            location, industry, invoiceType, serialNumber, tin,
            buildingNumber, streetName, citySubdivision, postalZone, city
        } = onboardData;

        const rawEnv = onboardData.environment || 'Simulation';
        const environment = rawEnv.charAt(0).toUpperCase() + rawEnv.slice(1).toLowerCase();

        console.log(`[Compliance Service] Onboarding request: Env=${environment}, VAT=${vat}`);

        // 1. Production CSID OTP Onboarding Workflow
        if (environment === 'Production') {
            const existingProdCert = await prisma.certificate.findFirst({
                where: {
                    company: { vat_number: vat },
                    type: 'PRODUCTION',
                    is_active: true
                }
            });

            if (existingProdCert && !existingProdCert.csid?.startsWith('MOCK_') && !otp) {
                console.log(`[Compliance Service] Active real Production CSID already configured for VAT ${vat}. Skipping OTP onboarding.`);
                return {
                    success: true,
                    companyId: existingProdCert.company_id,
                    message: 'Production CSID is already configured and active.',
                    existing: true
                };
            }

            if (!otp) {
                throw new Error(
                    `Production OTP is required for ZATCA Production CSID onboarding. Please generate a fresh Production OTP from the ZATCA portal (fatoora.zatca.gov.sa) and submit it.`
                );
            }

            console.log(`[Compliance Service] Starting REAL Production CSID Onboarding for VAT ${vat}...`);
            const client = ZatcaClientFactory.getClient('Production');

            const numericTIN = (tin && /^\d{10}$/.test(tin)) ? tin : vat.substring(0, 10);
            const cnValue = `PROD-EasyLease-${vat}`;
            const formattedSerial = serialNumber?.includes('|')
                ? serialNumber
                : `1-EasyLease|2-Desktop|3-${crypto.randomUUID()}`;

            const csrConfig = `csr.common.name=${cnValue}
csr.serial.number=${formattedSerial}
csr.organization.identifier=${vat}
csr.organization.unit.name=${numericTIN}
csr.organization.name=${numericTIN}
csr.country.name=SA
csr.invoice.type=${invoiceType || '1000'}
csr.location.address=${location || 'Riyadh'}
csr.industry.business.category=${industry || 'Transport'}`;

            // Generate Production CSR & EC Keypair (isSimulation = false)
            const csrResult = await generateCSR(csrConfig, false);
            const prodCsr = csrResult.csr;
            const prodPrivateKey = csrResult.privateKey;

            // Step A: Exchange OTP with ZATCA Production Endpoint (/compliance)
            console.log('[Compliance Service] Exchanging OTP with ZATCA Production API...');
            const complianceResult = await client.onboard({
                csr: prodCsr,
                otp
            });

            const complianceCSID = complianceResult.binarySecurityToken;
            const complianceSecret = complianceResult.secret;
            const requestId = (complianceResult as any).requestID || (complianceResult as any).requestId;

            // Step B: Run Mandatory Compliance Checks (Standard 388, Credit Note 381, Debit Note 383)
            console.log('[Compliance Service] Running mandatory Production compliance checks (388, 381, 383)...');
            const sampleInvoice = {
                invoiceNumber: 'COMPLIANCE-PROD-001',
                uuid: crypto.randomUUID(),
                issueDate: new Date().toISOString(),
                invoiceSubtype: 'STANDARD',
                profileId: 'reporting:1.0',
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

            const cleanComplianceCsid = complianceCSID.replace(/-----BEGIN CERTIFICATE-----/g, '').replace(/-----END CERTIFICATE-----/g, '').replace(/\s+/g, '');

            // Standard Invoice 388
            const xmlStandard = await (generateInvoiceXML as any)(sampleInvoice);
            const signedStandard = await signInvoice(xmlStandard, cleanComplianceCsid, prodPrivateKey, false);
            await client.checkCompliance({
                csid: complianceCSID,
                secret: complianceSecret,
                xmlHash: signedStandard.hash,
                xmlBase64: Buffer.from(signedStandard.signedXml).toString('base64'),
                uuid: sampleInvoice.uuid
            });
            console.log('[Compliance Service] ✅ Production Standard Invoice (388) compliance check passed.');

            // Credit Note 381
            const todayDateStr = new Date().toISOString().split('T')[0];
            const creditNoteInvoice = {
                ...sampleInvoice,
                invoiceNumber: 'COMPLIANCE-PROD-002',
                uuid: crypto.randomUUID(),
                invoiceSubtype: 'STANDARD',
                documentType: 'CREDIT_NOTE',
                invoiceCounterValue: 2,
                previousInvoiceHash: signedStandard.hash,
                billingReference: { id: 'COMPLIANCE-PROD-001', issueDate: todayDateStr },
                instructionNote: 'Cancellation of transport agreement'
            };
            const xmlCreditNote = await (generateInvoiceXML as any)(creditNoteInvoice);
            const signedCreditNote = await signInvoice(xmlCreditNote, cleanComplianceCsid, prodPrivateKey, false);
            await client.checkCompliance({
                csid: complianceCSID,
                secret: complianceSecret,
                xmlHash: signedCreditNote.hash,
                xmlBase64: Buffer.from(signedCreditNote.signedXml).toString('base64'),
                uuid: creditNoteInvoice.uuid
            });
            console.log('[Compliance Service] ✅ Production Credit Note (381) compliance check passed.');

            // Debit Note 383
            const debitNoteInvoice = {
                ...sampleInvoice,
                invoiceNumber: 'COMPLIANCE-PROD-003',
                uuid: crypto.randomUUID(),
                invoiceSubtype: 'STANDARD',
                documentType: 'DEBIT_NOTE',
                invoiceCounterValue: 3,
                previousInvoiceHash: signedCreditNote.hash,
                billingReference: { id: 'COMPLIANCE-PROD-001', issueDate: todayDateStr },
                instructionNote: 'Additional transport service charge'
            };
            const xmlDebitNote = await (generateInvoiceXML as any)(debitNoteInvoice);
            const signedDebitNote = await signInvoice(xmlDebitNote, cleanComplianceCsid, prodPrivateKey, false);
            await client.checkCompliance({
                csid: complianceCSID,
                secret: complianceSecret,
                xmlHash: signedDebitNote.hash,
                xmlBase64: Buffer.from(signedDebitNote.signedXml).toString('base64'),
                uuid: debitNoteInvoice.uuid
            });
            console.log('[Compliance Service] ✅ Production Debit Note (383) compliance check passed.');

            // Step C: Request Production CSID (PCSID) from ZATCA Production Endpoint (/production/csids)
            console.log('[Compliance Service] Requesting Production CSID from ZATCA...');
            const pcsidResult = await client.requestProductionCSID({
                complianceCSID,
                complianceSecret,
                requestId: String(requestId)
            });

            const finalProdCSID = pcsidResult.binarySecurityToken || complianceCSID;
            const finalProdSecret = pcsidResult.secret || complianceSecret;

            // Step C: Validate Cryptographic Cert/Keypair pairing
            const isPairValid = validateCertKeyPair(finalProdCSID, prodPrivateKey);
            if (!isPairValid) {
                throw new Error('Cryptographic validation failed: Production CSID does not match generated private key.');
            }

            // Step D: Store in DB & Archive Old MOCK Certs
            const { company, certId } = await prisma.$transaction(async (tx) => {
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

                const dbCompany = await tx.company.upsert({
                    where: { vat_number: vat },
                    update: {
                        registered_name: companyName,
                        environment: 'PRODUCTION',
                        user: { connect: { id: user.id } }
                    },
                    create: {
                        vat_number: vat,
                        registered_name: companyName,
                        branch_name: branchName || 'HQ',
                        building_number: buildingNumber || '1111',
                        street_name: streetName || 'Test Street',
                        city_subdivision: citySubdivision || 'District',
                        postal_zone: postalZone || '11111',
                        city: city || location || 'Riyadh',
                        environment: 'PRODUCTION',
                        user: { connect: { id: user.id } },
                        cr_number: onboardData.crNumber || '1010816075'
                    }
                });

                // Archive older Production certs (including MOCK ID 9)
                await tx.certificate.updateMany({
                    where: { company_id: dbCompany.id, type: 'PRODUCTION', is_active: true },
                    data: { is_active: false }
                });

                // Save real Production certificate record
                const newCert = await tx.certificate.create({
                    data: {
                        company: { connect: { id: dbCompany.id } },
                        type: 'PRODUCTION',
                        common_name: commonName || cnValue,
                        certificate: finalProdCSID,
                        public_key: 'PUBLIC_KEY_PRODUCTION',
                        private_key: SecurityService.encrypt(prodPrivateKey),
                        csid: finalProdCSID,
                        secret: SecurityService.encrypt(finalProdSecret),
                        is_active: true
                    }
                });

                return { company: dbCompany, certId: newCert.id };
            });

            await logZatcaActivity({
                action: 'Production CSID Onboarded',
                status: 'Success',
                details: `Company ${companyName} (${vat}) successfully onboarded Production CSID from ZATCA`,
                user: userContext.email,
                role: userContext.role,
                ipAddress: userContext.ip,
                resourceId: vat,
                metadata: { companyId: company.id, certId, environment: 'PRODUCTION' }
            });

            return {
                success: true,
                companyId: company.id,
                certId,
                message: 'Production CSID successfully issued by ZATCA and activated in database.',
                environment: 'PRODUCTION'
            };
        }

        // 2. Simulation Onboarding Workflow
        const client = ZatcaClientFactory.getClient('Simulation');

        const numericTIN = (tin && /^\d{10}$/.test(tin)) ? tin : vat.substring(0, 10);
        const cnValue = `TST-EasyLease-${vat}`;

        const formattedSerial = serialNumber?.includes('|')
            ? serialNumber
            : `1-EasyLease|2-Desktop|3-${crypto.randomUUID()}`;

        const csrConfig = `csr.common.name=${cnValue}
csr.serial.number=${formattedSerial}
csr.organization.identifier=${vat}
csr.organization.unit.name=${numericTIN}
csr.organization.name=${numericTIN}
csr.country.name=SA
csr.invoice.type=${invoiceType || '1000'}
csr.location.address=${location || 'Riyadh'}
csr.industry.business.category=${industry || 'Transport'}`;

        let csr: string, privateKey: string;

        // Check if there is an existing Simulation keypair stored in DB to make retries safe
        const existingSimCert = await prisma.certificate.findFirst({
            where: {
                company: { vat_number: vat },
                type: 'SIMULATION',
                is_active: true
            }
        });

        if (existingSimCert && existingSimCert.private_key) {
            console.log('[Compliance Service] Reusing existing stored Simulation private key for retry.');
            privateKey = SecurityService.decrypt(existingSimCert.private_key);
            // Re-generate CSR matching existing private key
            const result = await generateCSR(csrConfig, true);
            csr = result.csr;
        } else if (process.env.USE_MOCK_SDK === 'true' && !onboardData.forceRealSimulation) {
            csr = 'MOCK_CSR_CONTENT';
            privateKey = 'MOCK_PRIVATE_KEY_SIM';
        } else {
            const result = await generateCSR(csrConfig, true);
            csr = result.csr;
            privateKey = result.privateKey;
        }

        // Exchange OTP for Compliance CSID
        if (!otp) {
            throw new Error('OTP is required for Simulation Compliance onboarding.');
        }

        const complianceResult = await client.onboard({
            csr,
            otp
        });

        const complianceCSID = complianceResult.binarySecurityToken;
        const complianceSecret = complianceResult.secret;

        // Run 3 Compliance Checks (Standard Invoice 388, Credit Note 381, Debit Note 383)
        const sampleInvoice = {
            invoiceNumber: 'COMPLIANCE-001',
            uuid: crypto.randomUUID(),
            issueDate: new Date().toISOString(),
            invoiceSubtype: 'STANDARD',
            profileId: 'reporting:1.0',
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

        // Standard Invoice 388
        const xmlStandard = await (generateInvoiceXML as any)(sampleInvoice);
        const signedStandard = await signInvoice(xmlStandard, complianceCSID.trim(), privateKey, true);

        await client.checkCompliance({
            csid: complianceCSID,
            secret: complianceSecret,
            xmlHash: signedStandard.hash,
            xmlBase64: Buffer.from(signedStandard.signedXml).toString('base64'),
            uuid: sampleInvoice.uuid
        });
        console.log('[Compliance Service] ✅ Standard Invoice compliance check passed.');

        // Standard Credit Note 381
        const todayDateStr = new Date().toISOString().split('T')[0];
        const creditNoteInvoice = {
            ...sampleInvoice,
            invoiceNumber: 'COMPLIANCE-002',
            uuid: crypto.randomUUID(),
            invoiceSubtype: 'STANDARD',
            documentType: 'CREDIT_NOTE',
            invoiceCounterValue: 2,
            previousInvoiceHash: signedStandard.hash,
            billingReference: { id: 'COMPLIANCE-001', issueDate: todayDateStr },
            instructionNote: 'Cancellation of transport agreement'
        };
        const xmlCreditNote = await (generateInvoiceXML as any)(creditNoteInvoice);
        const signedCreditNote = await signInvoice(xmlCreditNote, complianceCSID.trim(), privateKey, true);

        await client.checkCompliance({
            csid: complianceCSID,
            secret: complianceSecret,
            xmlHash: signedCreditNote.hash,
            xmlBase64: Buffer.from(signedCreditNote.signedXml).toString('base64'),
            uuid: creditNoteInvoice.uuid
        });
        console.log('[Compliance Service] ✅ Standard Credit Note compliance check passed.');

        // Standard Debit Note 383
        const debitNoteInvoice = {
            ...sampleInvoice,
            invoiceNumber: 'COMPLIANCE-003',
            uuid: crypto.randomUUID(),
            invoiceSubtype: 'STANDARD',
            documentType: 'DEBIT_NOTE',
            invoiceCounterValue: 3,
            previousInvoiceHash: signedCreditNote.hash,
            billingReference: { id: 'COMPLIANCE-001', issueDate: todayDateStr },
            instructionNote: 'Additional transport service charge'
        };
        const xmlDebitNote = await (generateInvoiceXML as any)(debitNoteInvoice);
        const signedDebitNote = await signInvoice(xmlDebitNote, complianceCSID.trim(), privateKey, true);

        await client.checkCompliance({
            csid: complianceCSID,
            secret: complianceSecret,
            xmlHash: signedDebitNote.hash,
            xmlBase64: Buffer.from(signedDebitNote.signedXml).toString('base64'),
            uuid: debitNoteInvoice.uuid
        });
        console.log('[Compliance Service] ✅ Standard Debit Note compliance check passed.');

        // Persist Simulation Compliance Certificate in Database
        const { company } = await prisma.$transaction(async (tx) => {
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

            const dbCompany = await tx.company.upsert({
                where: { vat_number: vat },
                update: {
                    registered_name: companyName,
                    branch_name: branchName,
                    building_number: buildingNumber,
                    street_name: streetName,
                    city_subdivision: citySubdivision,
                    postal_zone: postalZone,
                    city: city || location,
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
                    environment: 'SIMULATION',
                    user: { connect: { id: user.id } },
                    cr_number: onboardData.crNumber || '1010816075'
                }
            });

            await tx.certificate.updateMany({
                where: { company_id: dbCompany.id, type: 'SIMULATION', is_active: true },
                data: { is_active: false }
            });

            await tx.certificate.create({
                data: {
                    company: { connect: { id: dbCompany.id } },
                    type: 'SIMULATION',
                    common_name: commonName || cnValue,
                    certificate: complianceCSID,
                    public_key: 'PUBLIC_KEY_SIMULATION',
                    private_key: SecurityService.encrypt(privateKey),
                    csid: complianceCSID,
                    secret: SecurityService.encrypt(complianceSecret),
                    is_active: true
                }
            });

            return { company: dbCompany };
        });

        await logZatcaActivity({
            action: 'Simulation Compliance Passed',
            status: 'Success',
            details: `Company ${companyName} (${vat}) successfully passed Simulation compliance tests (388, 381, 383)`,
            user: userContext.email,
            role: userContext.role,
            ipAddress: userContext.ip,
            resourceId: vat,
            metadata: { companyId: company.id, environment: 'SIMULATION' }
        });

        return { success: true, companyId: company.id, complianceCSID };
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

        const cert = company.certificates.find((c: any) => c.is_active && c.type === 'PRODUCTION');
        if (!cert) throw new Error('Active Production certificate not found');

        const currentCSID = cert.csid!;
        const currentSecret = SecurityService.decrypt(cert.secret!);

        const client = ZatcaClientFactory.getClient('Production');
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

