import axios from 'axios';

const ZATCA_BASE_URL = {
    sandbox: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
    simulation: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
    production: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core'
};

export const onboardCompliance = async (env: string, csr: string, otp: string) => {
    const normalizedEnv = env.toLowerCase() as keyof typeof ZATCA_BASE_URL;
    const url = `${ZATCA_BASE_URL[normalizedEnv]}/compliance`;
    
    // CSR is already PEM string (from generateCSR)
    // ZATCA expects it as Base64 encoded string
    const csrBase64 = Buffer.from(csr).toString('base64');
    
    console.log(`Sending Compliance Request to ${url}`);
    
    const response = await axios.post(url, {
        csr: csrBase64
    }, {
        headers: {
            'Accept-Version': 'v2',
            'Accept-Language': 'en',
            'OTP': otp,
            'Content-Type': 'application/json'
        }
    });

    return response.data; // Includes binarySecurityToken (complianceCSID) and secret
};

export const requestProductionCSID = async (env: string, complianceCSID: string, complianceSecret: string, requestId: string) => {
    const normalizedEnv = env.toLowerCase() as keyof typeof ZATCA_BASE_URL;
    const url = `${ZATCA_BASE_URL[normalizedEnv]}/production/csids`;
    const auth = Buffer.from(`${complianceCSID}:${complianceSecret}`).toString('base64');

    const response = await axios.post(url, {
        compliance_request_id: requestId
    }, {
        headers: {
            'Authorization': `Basic ${auth}`,
            'Accept-Version': 'v2',
            'Accept-Language': 'en'
        }
    });

    return response.data; // Includes productionCSID and Secret
};

export const reportInvoice = async (env: string, csid: string, secret: string, xmlHash: string, xmlBase64: string) => {
    const normalizedEnv = env.toLowerCase() as keyof typeof ZATCA_BASE_URL;
    const url = `${ZATCA_BASE_URL[normalizedEnv]}/invoices/reporting/single`;
    const auth = Buffer.from(`${csid}:${secret}`).toString('base64');

    const response = await axios.post(url, {
        invoiceHash: xmlHash,
        uuid: '...', // Extract from XML
        invoice: xmlBase64
    }, {
        headers: {
            'Authorization': `Basic ${auth}`,
            'Accept-Version': 'v2',
            'Accept-Language': 'en'
        }
    });

    return response.data;
};

export const clearInvoice = async (env: string, csid: string, secret: string, xmlHash: string, xmlBase64: string) => {
    const normalizedEnv = env.toLowerCase() as keyof typeof ZATCA_BASE_URL;
    const url = `${ZATCA_BASE_URL[normalizedEnv]}/invoices/clearance/single`;
    const auth = Buffer.from(`${csid}:${secret}`).toString('base64');

    const response = await axios.post(url, {
        invoiceHash: xmlHash,
        uuid: '...', // Extract from XML
        invoice: xmlBase64
    }, {
        headers: {
            'Authorization': `Basic ${auth}`,
            'Accept-Version': 'v2',
            'Accept-Language': 'en'
        }
    });

    return response.data;
};

export const checkCompliance = async (env: string, complianceCSID: string, complianceSecret: string, sampleXmlHash: string, sampleXmlBase64: string, uuid: string = '...') => {
    const normalizedEnv = env.toLowerCase() as keyof typeof ZATCA_BASE_URL;
    const url = `${ZATCA_BASE_URL[normalizedEnv]}/compliance/invoices`;
    
    // Auth: Basic Base64(CSID:Secret)
    const auth = Buffer.from(`${complianceCSID}:${complianceSecret}`).toString('base64');

    console.log(`Running Compliance Check at ${url}`);
    console.log(`Using UUID: ${uuid}`);

    const response = await axios.post(url, {
        invoiceHash: sampleXmlHash,
        uuid: uuid,
        invoice: sampleXmlBase64
    }, {
        headers: {
            'Authorization': `Basic ${auth}`,
            'Accept-Version': 'v2',
            'Accept-Language': 'en',
            'Content-Type': 'application/json'
        }
    });

    return response.data;
};

export const renewProductionCSID = async (env: string, currentCSID: string, currentSecret: string, otp: string) => {
    const normalizedEnv = env.toLowerCase() as keyof typeof ZATCA_BASE_URL;
    const url = `${ZATCA_BASE_URL[normalizedEnv]}/production/csids`; // Renewal endpoint
    const auth = Buffer.from(`${currentCSID}:${currentSecret}`).toString('base64');

    const response = await axios.patch(url, {
    }, {
        headers: {
            'Authorization': `Basic ${auth}`,
            'OTP': otp,
            'Accept-Version': 'v2',
            'Accept-Language': 'en'
        }
    });

    return response.data; // New CSID
};
