
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

export const generateZatcaCSR = async (data: CSRData) => {
    const configContent = `
common.name=${data.commonName}
serial.number=1-Standard|${data.commonName}
organization.identifier=${data.vatNumber}
organization.unit.name=${data.organizationUnitName}
organization.name=${data.organizationName}
country.name=${data.countryName}
invoice.type=${data.invoiceType}
location.address=${data.location}
industry.business.category=${data.industry}
    `.trim();

    try {
        console.log("Attempting to generate CSR via SDK...");
        const result = await generateSDKCSR(configContent);
        return {
            csr: result.csr,
            privateKey: result.privateKey,
            publicKey: ''
        };
    } catch (error) {
        console.error("SDK logic failed, falling back to manual", error);
        return generateManualCSR(data);
    }
};

const generateManualCSR = async (data: CSRData) => {
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
        { type: '0.9.2342.19200300.100.1.1', value: data.vatNumber },
        { type: '2.5.4.12', value: data.invoiceType },
        { type: '2.5.4.26', value: data.location },
        { type: '2.5.4.15', value: data.industry }
    ];

    csr.setSubject(subject);

    return {
        csr: forge.pki.certificationRequestToPem(csr),
        privateKey,
        publicKey
    };
}
