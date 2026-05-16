
import { IZatcaClient, OnboardRequest, OnboardResponse, ComplianceCheckRequest, ComplianceCheckResponse, ProductionCSIDRequest, ProductionCSIDResponse, RenewalRequest, ReportRequest } from './IZatcaClient.js';

/**
 * Developer Sandbox Client
 */
export class SandboxClient implements IZatcaClient {
    // Sandbox uses different credentials and behavior. Implement as needed based on ZATCA Sandbox docs.
    // For now, inheriting base behavior but with sandbox URL.
    private baseUrl = 'https://sandbox.zatca.gov.sa/e-invoicing/sandbox';
    
    // Implementation would be similar to Production but specifically for Sandbox.
    // ... skipping detailed implementation for brevity as it's similar to ProductionClient
    async onboard(data: OnboardRequest): Promise<OnboardResponse> { throw new Error('Sandbox onboarding not implemented'); }
    async checkCompliance(data: ComplianceCheckRequest): Promise<ComplianceCheckResponse> { throw new Error('Sandbox compliance not implemented'); }
    async requestProductionCSID(data: ProductionCSIDRequest): Promise<ProductionCSIDResponse> { throw new Error('Sandbox prod CSID not implemented'); }
    async renewProductionCSID(data: RenewalRequest): Promise<ProductionCSIDResponse> { throw new Error('Sandbox renewal not implemented'); }
    async reportInvoice(data: ReportRequest): Promise<any> { throw new Error('Sandbox reporting not implemented'); }
    async clearInvoice(data: ReportRequest): Promise<any> { throw new Error('Sandbox clearance not implemented'); }
}

/**
 * Local Mock Client (Bypasses all ZATCA calls)
 */
export class MockClient implements IZatcaClient {
    async onboard(data: OnboardRequest): Promise<OnboardResponse> {
        console.log(`[ZATCA Mock] Onboarding for CSR: ${data.csr.substring(0, 20)}...`);
        return {
            binarySecurityToken: `MOCK_COMPLIANCE_BST_${Date.now()}`,
            secret: `MOCK_SECRET_${Date.now()}`,
            requestID: `MOCK_REQ_${Date.now()}`
        };
    }

    async checkCompliance(data: ComplianceCheckRequest): Promise<ComplianceCheckResponse> {
        console.log(`[ZATCA Mock] Compliance check for UUID: ${data.uuid}`);
        return {
            validationResults: { status: 'PASS', warnings: [], errors: [] },
            reportingStatus: 'REPORTED'
        };
    }

    async requestProductionCSID(data: ProductionCSIDRequest): Promise<ProductionCSIDResponse> {
        console.log(`[ZATCA Mock] Production CSID request for ReqID: ${data.requestId}`);
        return {
            binarySecurityToken: `MOCK_PROD_BST_${Date.now()}`,
            secret: `MOCK_PROD_SECRET_${Date.now()}`
        };
    }

    async renewProductionCSID(data: RenewalRequest): Promise<ProductionCSIDResponse> {
        console.log(`[ZATCA Mock] CSID renewal for: ${data.csid.substring(0, 10)}...`);
        return {
            binarySecurityToken: `MOCK_RENEWED_BST_${Date.now()}`,
            secret: `MOCK_RENEWED_SECRET_${Date.now()}`
        };
    }

    async reportInvoice(data: ReportRequest): Promise<any> {
        console.log(`[ZATCA Mock] Bypassing reporting for: ${data.uuid}`);
        return {
            validationResults: { status: 'PASS', warnings: [], errors: [] },
            reportingStatus: 'REPORTED',
            uuid: data.uuid
        };
    }

    async clearInvoice(data: ReportRequest): Promise<any> {
        console.log(`[ZATCA Mock] Bypassing clearance for: ${data.uuid}`);
        return {
            validationResults: { status: 'PASS', warnings: [], errors: [] },
            clearanceStatus: 'CLEARED',
            clearedInvoice: data.xmlBase64,
            uuid: data.uuid
        };
    }
}
