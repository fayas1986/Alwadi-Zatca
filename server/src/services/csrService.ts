
import forge from 'node-forge';
import crypto from 'crypto';
import { generateCSR as generateSDKCSR } from './sdkService';

export interface CSRData {
    commonName: string;
    organizationName: string;
    organizationUnitName: string;
    countryName: string;
    invoiceType: string; // "1100" for EGS
    location: string;
    industry: string;
    vatNumber: string;
}

export const generateZatcaCSR = async (data: CSRData, isSimulation: boolean = true) => {
    // 1. Prepare Configuration for SDK
    // The SDK expects a properties file or arguments. 
    // Let's create a properties file content based on the standard ZATCA config format.

    // Standard ZATCA Config Template
    // csr.common.name=...
    // csr.serial.number=1-Standard|1000... (Solution Name or similar)
    // csr.organization.identifier=...
    // ...

    // However, the CLI usually takes a config file with these fields:
    // oid_section = OIDs
    // [ OIDs ]
    // certificateTemplateName = 1.3.6.1.4.1.311.20.2

    // OR simpler: standard OpenSSL config format which the SDK likely generates.

    // ACTUALLY: The SDK `csr` command takes a `-csrConfig` file.
    // The content of this file is usually a properties file like:
    /*
    commnon.name=...
    serial.number=...
    organization.identifier=...
    organization.unit.name=...
    organization.name=...
    country.name=...
    invoice.type=...
    location.address=...
    industry.business.category=...
    */

    // Let's map our data to this format.

    const configContent = `
csr.common.name=${data.commonName}
csr.serial.number=1-ZatcaConnect|2-Desktop|3-${data.commonName.split('-').pop() || '000'}
csr.organization.identifier=${data.vatNumber}
csr.organization.unit.name=${data.organizationUnitName}
csr.organization.name=${data.organizationName}
csr.country.name=${data.countryName}
csr.invoice.type=${data.invoiceType}
csr.location.address=${data.location}
csr.industry.business.category=${data.industry}
    `.trim();

    try {
        console.log(`Attempting to generate CSR via SDK (Simulation: ${isSimulation})...`);
        // Use the SDK service
        const result = await generateSDKCSR(configContent, isSimulation);
        return {
            csr: result.csr,
            privateKey: result.privateKey,
            publicKey: '' // SDK might not return the public key separately easily, usually embedded or inferred.
            // We can extract it if needed, but usually only CSR and Private Key are needed for onboarding.
        };
    } catch (error) {
        console.error("SDK logic failed, falling back to basic Node implementation (NOT PRODUCTION READY for ZATCA)", error);

        // Fallback: Use manual node-forge (original logic)
        // This is useful for dev/testing if SDK is missing or failing, 
        // but note that ZATCA might reject it due to specific OID ordering or custom extensions.

        return generateManualCSR(data);
    }
};

const generateManualCSR = async (data: CSRData) => {
    // Generate EC Keypair (secp256k1)
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'secp256k1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    const csr = forge.pki.createCertificationRequest();
    csr.publicKey = forge.pki.publicKeyFromPem(publicKey);

    const subject = [
        { name: 'commonName', value: data.commonName },
        { name: 'organizationUnitName', value: data.organizationUnitName },
        { name: 'organizationName', value: data.organizationName },
        { name: 'countryName', value: data.countryName },
        { type: '0.9.2342.19200300.100.1.1', value: data.vatNumber }, // UID
        { type: '2.5.4.12', value: data.invoiceType }, // Title
        { type: '2.5.4.26', value: data.location }, // Registered Address
        { type: '2.5.4.15', value: data.industry } // Business Category
    ];

    csr.setSubject(subject);

    return {
        csr: forge.pki.certificationRequestToPem(csr),
        privateKey,
        publicKey
    };
}
