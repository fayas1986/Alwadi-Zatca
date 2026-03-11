
import axios from 'axios';

const ZATCA_BASE_URL = {
    sandbox: 'https://gw-fatoora.zatca.gov.sa/api/v2',
    simulation: 'https://gw-fatoora.zatca.gov.sa/api/v2',
    production: 'https://core.zatca.gov.sa/api/v2'
};

export const onboardCompliance = async (env: 'sandbox' | 'simulation' | 'production', csr: string, otp: string) => {
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

export const requestProductionCSID = async (env: 'sandbox' | 'simulation' | 'production', complianceCSID: string, complianceSecret: string, requestId: string) => {
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

export const checkCompliance = async (env: 'sandbox' | 'simulation' | 'production', complianceCSID: string, complianceSecret: string, sampleXmlHash: string, sampleXmlBase64: string) => {
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

export const reportInvoice = async (env: 'sandbox' | 'simulation' | 'production', csid: string, secret: string, xmlHash: string, xmlBase64: string, uuid: string) => {
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

export const clearInvoice = async (env: 'sandbox' | 'simulation' | 'production', csid: string, secret: string, xmlHash: string, xmlBase64: string, uuid: string) => {
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
