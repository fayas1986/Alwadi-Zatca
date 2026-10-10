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

export interface CredentialAuthorizationContext {
    companyId: number;
    role?: string;
    isSuperAdmin?: boolean;
    isSystemWorker?: boolean;
    authenticatedUserId?: string;
    verifiedByServer?: boolean;
}

export interface CredentialLookupParams {
    companyId?: number;
    vatNumber?: string;
    environment: 'PRODUCTION' | 'SIMULATION' | 'SANDBOX' | string;
    authContext: CredentialAuthorizationContext;
}

export const createVerifiedUserContext = (companyId: number, role?: string, userId?: string): CredentialAuthorizationContext => ({
    companyId,
    role,
    isSuperAdmin: role === 'SUPER_ADMIN',
    authenticatedUserId: userId,
    verifiedByServer: true
});

export const createVerifiedSuperAdminContext = (userId?: string): CredentialAuthorizationContext => ({
    companyId: 0,
    role: 'SUPER_ADMIN',
    isSuperAdmin: true,
    authenticatedUserId: userId || 'superadmin-system',
    verifiedByServer: true
});

export const createVerifiedSystemWorkerContext = (companyId: number): CredentialAuthorizationContext => ({
    companyId,
    isSystemWorker: true,
    verifiedByServer: true
});

export const getProductionCredentials = async (
    params: CredentialLookupParams
) => {
    // 1. Enforce Structured Lookup Object
    if (typeof params !== 'object' || params === null) {
        throw new Error('AMBIGUOUS_CREDENTIAL_LOOKUP: Credential lookup requires a structured lookup object specifying explicit environment and authContext. Positional legacy arguments are disabled.');
    }

    const { companyId, vatNumber, environment, authContext } = params;

    // 2. Enforce Mandatory Authorization Context
    if (!authContext) {
        throw new Error('UNAUTHORIZED_CREDENTIAL_ACCESS: Authorization context is required for credential retrieval. Missing context fails closed.');
    }

    // 3. Reject Unverified Auth Contexts & Forged Roles
    if (authContext.verifiedByServer !== true) {
        if (authContext.role === 'SUPER_ADMIN' || authContext.isSuperAdmin === true) {
            throw new Error('FORGED_SUPER_ADMIN_ROLE: Unverified super-admin role supplied. Access denied.');
        }
        if (authContext.isSystemWorker === true) {
            throw new Error('FORGED_SYSTEM_WORKER_CONTEXT: Unverified system worker context supplied. Access denied.');
        }
        throw new Error('UNVERIFIED_AUTHORIZATION_CONTEXT: Authorization context must be verified by server authentication.');
    }

    // 4. Require Explicit Valid Environment (No implicit default)
    if (!environment || typeof environment !== 'string') {
        throw new Error("INVALID_ENVIRONMENT: Credential lookup requires an explicit, valid environment ('PRODUCTION' | 'SIMULATION' | 'SANDBOX'). Defaulting to production is prohibited.");
    }

    const targetEnv = environment.toUpperCase();
    if (!['PRODUCTION', 'SIMULATION', 'SANDBOX'].includes(targetEnv)) {
        throw new Error(`INVALID_ENVIRONMENT: '${environment}' is not a valid ZATCA environment. Must be 'PRODUCTION', 'SIMULATION', or 'SANDBOX'.`);
    }

    // 5. Unambiguous Primary Key or VAT Lookup (No numeric string heuristics)
    if (companyId === undefined && !vatNumber) {
        throw new Error('Credential lookup requires an explicit companyId or vatNumber.');
    }

    let whereClause: any = {};
    if (companyId !== undefined) {
        if (typeof companyId !== 'number' || isNaN(companyId)) {
            throw new Error('INVALID_COMPANY_ID: companyId must be a numeric integer.');
        }
        whereClause = { id: companyId };
    } else if (vatNumber !== undefined) {
        if (typeof vatNumber !== 'string' || !vatNumber.trim()) {
            throw new Error('INVALID_VAT_NUMBER: vatNumber must be a non-empty string.');
        }
        whereClause = { vat_number: vatNumber.trim() };
    }

    const company = await prisma.company.findFirst({
        where: whereClause,
        include: { certificates: true }
    });

    if (!company) {
        throw new Error(`Company not found for identifier: ${companyId !== undefined ? companyId : vatNumber}`);
    }

    // 6. Strict Tenant Authorization Verification & Audit Logging
    if (authContext.isSuperAdmin === true) {
        console.info(`[SECURITY AUDIT] SUPER_ADMIN privileged credential access override invoked by principal ${authContext.authenticatedUserId || 'SUPER_ADMIN'} for target company ID ${company.id} (${company.vat_number}).`);
    } else if (authContext.isSystemWorker === true) {
        if (authContext.companyId !== company.id) {
            throw new Error(`UNAUTHORIZED_TENANT_ACCESS: System worker for company ${authContext.companyId} cannot access company ${company.id} (${company.registered_name}).`);
        }
    } else {
        if (authContext.companyId !== company.id) {
            throw new Error(`UNAUTHORIZED_TENANT_ACCESS: Authenticated company ID ${authContext.companyId} is not authorized to access credentials for company ${company.id} (${company.registered_name}).`);
        }
    }

    // 7. Strict Environment Matching — Zero Implicit Fallback
    const activeCert = company.certificates.find((c: any) => 
        c.is_active === true && 
        c.company_id === company.id && 
        c.type === targetEnv
    );

    if (!activeCert || !activeCert.csid || !activeCert.secret || !activeCert.private_key) {
        throw new Error(`Active ZATCA ${targetEnv} credentials (CSID, secret, private_key) not found for company ${company.registered_name} (${company.vat_number}). Implicit fallback across environments is prohibited.`);
    }

    // 8. Ensure binding consistency
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
            environment: params.environment || 'PRODUCTION',
            authContext: params.authContext
        });
        const env = credentials.environment;
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

