
export interface OnboardRequest {
    csr: string;
    otp: string;
}

export interface OnboardResponse {
    binarySecurityToken: string;
    secret: string;
    requestID: string;
}

export interface ComplianceCheckRequest {
    csid: string;
    secret: string;
    xmlHash: string;
    xmlBase64: string;
    uuid: string;
}

export interface ComplianceCheckResponse {
    validationResults: {
        status: 'PASS' | 'WARNING' | 'ERROR';
        warnings: any[];
        errors: any[];
    };
    reportingStatus?: string;
    clearanceStatus?: string;
}

export interface ProductionCSIDRequest {
    complianceCSID: string;
    complianceSecret: string;
    requestId: string;
}

export interface ProductionCSIDResponse {
    binarySecurityToken: string;
    secret: string;
}

export interface RenewalRequest {
    csid: string;
    secret: string;
    otp: string;
}

export interface ReportRequest {
    csid: string;
    secret: string;
    xmlHash: string;
    xmlBase64: string;
    uuid: string;
}

export interface IZatcaClient {
    onboard(data: OnboardRequest): Promise<OnboardResponse>;
    checkCompliance(data: ComplianceCheckRequest): Promise<ComplianceCheckResponse>;
    requestProductionCSID(data: ProductionCSIDRequest): Promise<ProductionCSIDResponse>;
    renewProductionCSID(data: RenewalRequest): Promise<ProductionCSIDResponse>;
    reportInvoice(data: ReportRequest): Promise<any>;
    clearInvoice(data: ReportRequest): Promise<any>;
}
