import axios from 'axios';

const ZATCA_BASE_URL = {
    sandbox: 'https://sandbox.zatca.gov.sa/e-invoicing/sandbox',
    simulation: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
    production: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core'
};

const isMockMode = () => {
    return process.env.USE_MOCK_SDK === 'true' || (process.env.VERCEL === '1' && process.env.JAVA_EXE_PATH === undefined);
};

// EDGE 2: Geo-Redundancy Failover Manager
export class FailoverManager {
    private static primaryRegion: 'primary' | 'secondary' = 'primary';
    private static lastHealthCheck = 0;
    private static readonly COOLDOWN_MS = 60000; // 1 minute

    static getUrl(env: keyof typeof ZATCA_BASE_URL, path: string): string {
        const baseUrl = ZATCA_BASE_URL[env];
        const regionSuffix = this.primaryRegion === 'secondary' ? '?region=secondary' : '';
        return `${baseUrl}${path}${regionSuffix}`;
    }

    static async markFailure() {
        if (this.primaryRegion === 'primary') {
            console.warn('[Failover] Primary region failure detected. Switching to SECONDARY.');
            this.primaryRegion = 'secondary';
            this.lastHealthCheck = Date.now();
        }
    }

    static async tryRestore() {
        if (this.primaryRegion === 'secondary' && Date.now() - this.lastHealthCheck > this.COOLDOWN_MS) {
            console.log('[Failover] Attempting to restore PRIMARY region...');
            this.primaryRegion = 'primary';
        }
    }
}

export const onboardCompliance = async (env: string, csr: string, otp: string) => {
    if (isMockMode() || csr.includes('MOCK_CSR')) {
        console.log(`[ZATCA] Mock Onboarding active for CSR: ${csr.substring(0, 20)}...`);
        return {
            binarySecurityToken: `MOCK_COMPLIANCE_BST_${Date.now()}`,
            secret: `MOCK_SECRET_${Date.now()}`,
            requestID: `MOCK_REQ_${Date.now()}`
        };
    }

    const normalizedEnv = env.toLowerCase() as keyof typeof ZATCA_BASE_URL;
    const url = `${ZATCA_BASE_URL[normalizedEnv]}/compliance`;
    
    const response = await axios.post(url, { csr, otp }, {
        headers: { 'Accept-Version': 'V2', 'Content-Type': 'application/json' }
    });
    return response.data; // Includes binarySecurityToken (complianceCSID) and secret
};

export const checkCompliance = async (env: string, csid: string, secret: string, xmlHash: string, xmlBase64: string, uuid: string) => {
    if (isMockMode() || csid.startsWith('MOCK_')) {
        console.log(`[ZATCA] Mock Compliance check active for UUID: ${uuid}`);
        return {
            validationResults: { status: 'PASS', warnings: [], errors: [] },
            reportingStatus: 'REPORTED'
        };
    }

    const normalizedEnv = env.toLowerCase() as keyof typeof ZATCA_BASE_URL;
    const url = `${ZATCA_BASE_URL[normalizedEnv]}/compliance/invoices`;
    const auth = Buffer.from(`${csid}:${secret}`).toString('base64');

    const response = await axios.post(url, {
        invoiceHash: xmlHash,
        uuid: uuid,
        invoice: xmlBase64
    }, {
        headers: {
            'Authorization': `Basic ${auth}`,
            'Accept-Version': 'V2',
            'Content-Type': 'application/json'
        }
    });
    return response.data;
};

export const requestProductionCSID = async (env: string, complianceCSID: string, complianceSecret: string, requestId: string) => {
    if (isMockMode() || complianceCSID.startsWith('MOCK_')) {
        console.log(`[ZATCA] Mock Production CSID request active for ComplianceID: ${complianceCSID.substring(0, 15)}...`);
        return {
            binarySecurityToken: `MOCK_PROD_BST_${Date.now()}`,
            secret: `MOCK_PROD_SECRET_${Date.now()}`
        };
    }

    const normalizedEnv = env.toLowerCase() as keyof typeof ZATCA_BASE_URL;
    const url = `${ZATCA_BASE_URL[normalizedEnv]}/production/csids`;
    const auth = Buffer.from(`${complianceCSID}:${complianceSecret}`).toString('base64');

    const response = await axios.post(url, { compliance_request_id: requestId }, {
        headers: {
            'Authorization': `Basic ${auth}`,
            'Accept-Version': 'V2',
            'Content-Type': 'application/json'
        }
    });
    return response.data;
};



export const renewProductionCSID = async (env: string, csid: string, secret: string, otp: string) => {
    if (isMockMode() || csid.startsWith('MOCK_')) {
        console.log(`[ZATCA] Mock CSID renewal active for CSID: ${csid.substring(0, 15)}...`);
        return {
            binarySecurityToken: `MOCK_PROD_BST_RENEWED_${Date.now()}`,
            secret: `MOCK_PROD_SECRET_RENEWED_${Date.now()}`
        };
    }

    const normalizedEnv = env.toLowerCase() as keyof typeof ZATCA_BASE_URL;
    const url = `${ZATCA_BASE_URL[normalizedEnv]}/production/csids/renewal`;
    const auth = Buffer.from(`${csid}:${secret}`).toString('base64');

    const response = await axios.post(url, { otp }, {
        headers: {
            'Authorization': `Basic ${auth}`,
            'Accept-Version': 'V2',
            'Content-Type': 'application/json'
        }
    });
    return response.data;
};

export const reportInvoice = async (env: string, csid: string, secret: string, xmlHash: string, xmlBase64: string, uuid: string) => {
    const normalizedEnv = env.toLowerCase() as keyof typeof ZATCA_BASE_URL;
    await FailoverManager.tryRestore();
    const url = FailoverManager.getUrl(normalizedEnv, '/invoices/reporting/single');
    const auth = Buffer.from(`${csid}:${secret}`).toString('base64');

    if (isMockMode() || csid === 'MOCK_TOKEN' || csid?.startsWith('MOCK_')) {
        console.log(`[ZATCA] ${csid?.startsWith('MOCK_') || isMockMode() ? 'Mock Mode' : 'Bypass requested'}: Bypassing reporting for ${uuid}`);
        return {
            validationResults: { status: 'PASS', warnings: [], errors: [] },
            reportingStatus: 'REPORTED',
            uuid: uuid
        };
    }

    try {
        const response = await axios.post(url, {
            invoiceHash: xmlHash,
            uuid: uuid,
            invoice: xmlBase64
        }, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept-Version': 'V2',
                'Content-Type': 'application/json',
                'Accept-Language': 'en'
            }
        });
        return response.data;
    } catch (error: any) {
        if (error.response?.status >= 500) await FailoverManager.markFailure();
        throw error;
    }
};

export const clearInvoice = async (env: string, csid: string, secret: string, xmlHash: string, xmlBase64: string, uuid: string) => {
    const normalizedEnv = env.toLowerCase() as keyof typeof ZATCA_BASE_URL;
    await FailoverManager.tryRestore();
    const url = FailoverManager.getUrl(normalizedEnv, '/invoices/clearance/single');
    const auth = Buffer.from(`${csid}:${secret}`).toString('base64');

    if (isMockMode() || csid === 'MOCK_TOKEN' || csid?.startsWith('MOCK_')) {
        console.log(`[ZATCA] ${csid?.startsWith('MOCK_') || isMockMode() ? 'Mock Mode' : 'Bypass requested'}: Bypassing clearance for ${uuid}`);
        return {
            validationResults: { status: 'PASS', warnings: [], errors: [] },
            clearanceStatus: 'CLEARED',
            clearedInvoice: xmlBase64,
            uuid: uuid
        };
    }

    try {
        const response = await axios.post(url, {
            invoiceHash: xmlHash,
            uuid: uuid,
            invoice: xmlBase64
        }, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept-Version': 'V2',
                'Content-Type': 'application/json',
                'Accept-Language': 'en'
            }
        });
        return response.data;
    } catch (error: any) {
        if (error.response?.status >= 500) await FailoverManager.markFailure();
        throw error;
    }
};
