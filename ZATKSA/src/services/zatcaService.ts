
import axios from 'axios';

const ZATCA_BASE_URL: Record<string, string> = {
    Sandbox: 'https://gw-fatoora.zatca.gov.sa/api/v2',      // Simulation/Sandbox - same endpoint per ZATCA docs
    Simulation: 'https://gw-fatoora.zatca.gov.sa/api/v2',   // Feature-flag enabled on ZATCA side via OTP
    Production: 'https://core.zatca.gov.sa/api/v2'
};

export const ZATCA_ENV_STATUS: Record<string, any> = {
    Sandbox: { name: 'Sandbox', url: 'gw-fatoora.zatca.gov.sa', healthUrl: 'https://gw-fatoora.zatca.gov.sa/api/v2/compliance' },
    Simulation: { name: 'Simulation', url: 'gw-fatoora.zatca.gov.sa', healthUrl: 'https://gw-fatoora.zatca.gov.sa/api/v2/compliance' },
    Production: { name: 'Production', url: 'core.zatca.gov.sa', healthUrl: 'https://core.zatca.gov.sa/api/v2/invoices/reporting/single' }
};

export type ZatcaEnv = 'Simulation' | 'Sandbox' | 'Production';

export const onboardCompliance = async (env: ZatcaEnv, csr: string, otp: string) => {
    const url = `${ZATCA_BASE_URL[env]}/compliance`;
    const response = await axios.post(url, {
        csr: Buffer.from(csr).toString('base64'),
        otp
    }, {
        headers: {
            'Accept-Version': 'v2',
            'OTP': otp
        }
    });

    return response.data; // Includes binarySecurityToken (Compliance CSID)
};

export const requestProductionCSID = async (env: ZatcaEnv, complianceCSID: string, complianceSecret: string, requestId: string) => {
    const url = `${ZATCA_BASE_URL[env]}/production/csids`;
    const auth = Buffer.from(`${complianceCSID}:${complianceSecret}`).toString('base64');

    const response = await axios.post(url, {
        requestId
    }, {
        headers: {
            'Authorization': `Basic ${auth}`,
            'Accept-Version': 'v2'
        }
    });

    return response.data; // Includes binarySecurityToken (Production CSID)
};

export const checkCompliance = async (env: ZatcaEnv, complianceCSID: string, complianceSecret: string, sampleXmlHash: string, sampleXmlBase64: string) => {
    const url = `${ZATCA_BASE_URL[env]}/compliance/invoices`;
    const auth = Buffer.from(`${complianceCSID}:${complianceSecret}`).toString('base64');

    const response = await axios.post(url, {
        invoiceHash: sampleXmlHash,
        uuid: '...',
        invoice: sampleXmlBase64
    }, {
        headers: {
            'Authorization': `Basic ${auth}`,
            'Accept-Version': 'v2',
            'Accept-Language': 'en'
        }
    });

    return response.data;
};

export const reportInvoice = async (env: ZatcaEnv, csid: string, secret: string, xmlHash: string, xmlBase64: string, uuid: string) => {
    if (csid.includes('dummy')) {
        console.log("Mocking ZATCA Report Response due to dummy certificate");
        return {
            reportingStatus: 'REPORTED',
            validationResults: { infoMessages: [], warningMessages: [], errorMessages: [], status: 'PASS' }
        };
    }

    const url = `${ZATCA_BASE_URL[env]}/invoices/reporting/single`;
    const auth = Buffer.from(`${csid}:${secret}`).toString('base64');

    const response = await axios.post(url, {
        invoiceHash: xmlHash,
        uuid: uuid,
        invoice: xmlBase64
    }, {
        headers: {
            'Authorization': `Basic ${auth}`,
            'Accept-Version': 'v2'
        }
    });

    return response.data;
};

export const clearInvoice = async (env: ZatcaEnv, csid: string, secret: string, xmlHash: string, xmlBase64: string, uuid: string) => {
    if (csid.includes('dummy')) {
        console.log("Mocking ZATCA Clear Response due to dummy certificate");
        return {
            clearanceStatus: 'CLEARED',
            validationResults: { infoMessages: [], warningMessages: [], errorMessages: [], status: 'PASS' }
        };
    }

    const url = `${ZATCA_BASE_URL[env]}/invoices/clearance/single`;
    const auth = Buffer.from(`${csid}:${secret}`).toString('base64');

    const response = await axios.post(url, {
        invoiceHash: xmlHash,
        uuid: uuid,
        invoice: xmlBase64
    }, {
        headers: {
            'Authorization': `Basic ${auth}`,
            'Accept-Version': 'v2'
        }
    });

    return response.data;
};
