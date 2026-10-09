import axios from 'axios';
import prisma from '../lib/prisma.js';

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
    
    // Ensure the CSR is base64 encoded if passed as a PEM string
    const base64Csr = csr.trim().startsWith('-----')
        ? Buffer.from(csr).toString('base64')
        : csr;

    const response = await axios.post(url, { csr: base64Csr }, {
        headers: { 
            'Accept-Version': 'V2', 
            'Content-Type': 'application/json',
            'OTP': otp
        }
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
        if (error.response?.data) {
            const dataStr = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data);
            console.error('[ZATCA Reporting Error Response]:', dataStr);
            error.message = `ZATCA Error (${error.response.status}): ${dataStr}`;
        }
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
        if (error.response?.data) {
            const dataStr = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data);
            console.error('[ZATCA Clearance Error Response]:', dataStr);
            error.message = `ZATCA Error (${error.response.status}): ${dataStr}`;
        }
        throw error;
    }
};

export interface CredentialLookupParams {
    companyId?: number;
    vatNumber?: string;
    environment?: 'PRODUCTION' | 'SIMULATION' | 'SANDBOX' | string;
    authContext?: {
        companyId: number;
        role?: string;
    };
}

export const getProductionCredentials = async (
    identifierOrOptions: string | number | CredentialLookupParams,
    optionalAuthContext?: { companyId: number; role?: string }
) => {
    let companyId: number | undefined;
    let vatNumber: string | undefined;
    let requestedEnv: string | undefined;
    let authContext = optionalAuthContext;

    if (typeof identifierOrOptions === 'object' && identifierOrOptions !== null) {
        companyId = identifierOrOptions.companyId;
        vatNumber = identifierOrOptions.vatNumber;
        requestedEnv = identifierOrOptions.environment;
        authContext = identifierOrOptions.authContext || optionalAuthContext;
    } else if (typeof identifierOrOptions === 'number') {
        companyId = identifierOrOptions;
    } else if (typeof identifierOrOptions === 'string') {
        if (/^\d+$/.test(identifierOrOptions) && identifierOrOptions.length < 10) {
            companyId = Number(identifierOrOptions);
        } else {
            vatNumber = identifierOrOptions;
        }
    }

    if (companyId === undefined && !vatNumber) {
        throw new Error('Credential lookup requires an explicit companyId or vatNumber.');
    }

    // 1. Fetch target company by unambiguous primary key or VAT
    let whereClause: any = {};
    if (companyId !== undefined) {
        whereClause = { id: companyId };
    } else if (vatNumber !== undefined) {
        whereClause = { vat_number: String(vatNumber) };
    }

    const company = await prisma.company.findFirst({
        where: whereClause,
        include: { certificates: true }
    });

    if (!company) {
        throw new Error(`Company not found for identifier: ${companyId || vatNumber}`);
    }

    // 2. Strict Tenant Authorization Verification
    if (authContext) {
        const isSuperAdmin = authContext.role === 'SUPER_ADMIN';
        if (!isSuperAdmin && authContext.companyId !== company.id) {
            throw new Error(`UNAUTHORIZED_TENANT_ACCESS: Authenticated company ID ${authContext.companyId} is not authorized to access credentials for company ${company.id} (${company.registered_name}).`);
        }
    }

    // 3. Strict Environment Matching — Zero Implicit Fallback
    const targetEnv = (requestedEnv || company.environment || 'PRODUCTION').toString().toUpperCase();

    const activeCert = company.certificates.find((c: any) => 
        c.is_active === true && 
        c.company_id === company.id && 
        c.type === targetEnv
    );

    if (!activeCert || !activeCert.csid || !activeCert.secret || !activeCert.private_key) {
        throw new Error(`Active ZATCA ${targetEnv} credentials (CSID, secret, private_key) not found for company ${company.registered_name} (${company.vat_number}). Implicit fallback across environments is prohibited.`);
    }

    // 4. Ensure binding consistency
    if (activeCert.company_id !== company.id || activeCert.type !== targetEnv || activeCert.is_active !== true) {
        throw new Error(`CREDENTIAL_BINDING_MISMATCH: Certificate ID ${activeCert.id} binding mismatch for company ${company.id} and environment ${targetEnv}.`);
    }

    const { SecurityService } = await import('./securityService.js');

    return {
        companyId: company.id,
        vatNumber: company.vat_number,
        companyName: company.registered_name,
        environment: targetEnv,
        csid: activeCert.csid,
        certificate: activeCert.certificate || activeCert.csid,
        secret: SecurityService.decrypt(activeCert.secret),
        privateKey: SecurityService.decrypt(activeCert.private_key)
    };
};

export const ZatcaService = {
    onboardCompliance,
    checkCompliance,
    requestProductionCSID,
    renewProductionCSID,
    reportInvoice,
    clearInvoice,
    getProductionCredentials,
    report: async (params: any) => {
        const credentials = await getProductionCredentials({
            companyId: params.companyId,
            vatNumber: params.vat,
            environment: params.environment,
            authContext: params.authContext
        });
        const env = credentials.environment || 'PRODUCTION';
        return await reportInvoice(
            env,
            credentials.csid,
            credentials.secret,
            params.invoiceData?.hash || '',
            params.invoiceData?.xmlBase64 || '',
            params.invoiceData?.uuid || ''
        );
    },
    reprocessInvoice: async (invoiceId: number) => {
        const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
        if (!invoice) throw new Error('Invoice not found');
        return await prisma.invoice.update({
            where: { id: invoiceId },
            data: { status: 'PENDING', retry_count: 0, error_log: null }
        });
    }
};
