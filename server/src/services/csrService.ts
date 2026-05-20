
import crypto from 'crypto';
import { generateCSR as generateSDKCSR } from './sdkService.js';

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
            publicKey: '' // Public key is embedded in CSR/Private key
        };
    } catch (error: any) {
        console.error("SDK logic failed. Production-ready CSR generation is only possible via the ZATCA SDK.");
        throw new Error(`ZATCA SDK CSR Generation Failed: ${error.message}. Please ensure JAVA_EXE_PATH and ZATCA_SDK_PATH are correctly configured in .env`);
    }
};
