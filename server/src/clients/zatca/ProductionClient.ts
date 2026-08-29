
import { BaseZatcaClient } from './BaseZatcaClient.js';
import { 
    IZatcaClient, OnboardRequest, OnboardResponse, ComplianceCheckRequest, 
    ComplianceCheckResponse, ProductionCSIDRequest, ProductionCSIDResponse, 
    RenewalRequest, ReportRequest 
} from './IZatcaClient.js';

export class ProductionClient extends BaseZatcaClient implements IZatcaClient {
    protected baseUrl = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core';

    async onboard(data: OnboardRequest): Promise<OnboardResponse> {
        const base64Csr = data.csr.trim().startsWith('-----')
            ? Buffer.from(data.csr).toString('base64')
            : data.csr;
        return this.post<OnboardResponse>('/compliance', { csr: base64Csr }, { OTP: data.otp });
    }

    async checkCompliance(data: ComplianceCheckRequest): Promise<ComplianceCheckResponse> {
        const auth = this.getAuthHeader(data.csid, data.secret);
        return this.post<ComplianceCheckResponse>('/compliance/invoices', {
            invoiceHash: data.xmlHash,
            uuid: data.uuid,
            invoice: data.xmlBase64
        }, { Authorization: auth });
    }

    async requestProductionCSID(data: ProductionCSIDRequest): Promise<ProductionCSIDResponse> {
        const auth = this.getAuthHeader(data.complianceCSID, data.complianceSecret);
        return this.post<ProductionCSIDResponse>('/production/csids', {
            compliance_request_id: data.requestId
        }, { Authorization: auth });
    }

    async renewProductionCSID(data: RenewalRequest): Promise<ProductionCSIDResponse> {
        const auth = this.getAuthHeader(data.csid, data.secret);
        return this.post<ProductionCSIDResponse>('/production/csids/renewal', {
            otp: data.otp
        }, { Authorization: auth });
    }

    async reportInvoice(data: ReportRequest): Promise<any> {
        const auth = this.getAuthHeader(data.csid, data.secret);
        return this.post('/invoices/reporting/single', {
            invoiceHash: data.xmlHash,
            uuid: data.uuid,
            invoice: data.xmlBase64
        }, { Authorization: auth });
    }

    async clearInvoice(data: ReportRequest): Promise<any> {
        const auth = this.getAuthHeader(data.csid, data.secret);
        return this.post('/invoices/clearance/single', {
            invoiceHash: data.xmlHash,
            uuid: data.uuid,
            invoice: data.xmlBase64
        }, { Authorization: auth });
    }
}
