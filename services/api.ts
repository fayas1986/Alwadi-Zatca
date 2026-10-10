const API_PREFIX = typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_API_BASE_URL ? (import.meta as any).env.VITE_API_BASE_URL.replace(/\/$/, '') : '';
const API_BASE_URL = `${API_PREFIX}/api/zatca`;

const getAuthHeaders = (extraHeaders: Record<string, string> = {}): Record<string, string> => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    const role = extraHeaders.role || localStorage.getItem('userRole') || sessionStorage.getItem('userRole') || 'IT_ADMIN';
    const email = extraHeaders.email || localStorage.getItem('userEmail') || sessionStorage.getItem('userEmail') || '';
    
    const headers: Record<string, string> = {
        'x-user-role': role,
        'x-user-email': email,
        ...extraHeaders
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
};

export const onboardSolution = async (data: any) => {
    const response = await fetch(`${API_BASE_URL}/onboard`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Onboarding failed');
    }
    return response.json();
};

export const reportInvoice = async (invoice: any, vat: string) => {
    // Backend router now handles routing to Report/Clear based on invoice type
    const response = await fetch(`${API_BASE_URL}/invoice/report`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ invoice, vat })
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Submission failed');
    }
    return response.json();
};

export const clearInvoice = async (invoice: any, vat: string) => {
    return reportInvoice(invoice, vat); // Same endpoint, logic handled on backend
};

export const getCertificates = async (companyId: string, headers: any = {}) => {
    const response = await fetch(`${API_BASE_URL}/certificates?companyId=${companyId}`, {
        headers: getAuthHeaders(headers)
    });
    if (!response.ok) {
        throw new Error('Failed to fetch certificates');
    }
    return response.json();
};

export const getInvoices = async (companyId: string, headers: any = {}) => {
    const response = await fetch(`${API_BASE_URL}/invoices?companyId=${companyId}`, {
        headers: getAuthHeaders(headers)
    });
    if (!response.ok) {
        throw new Error('Failed to fetch invoices');
    }
    return response.json();
};

export const getInvoiceById = async (id: string, headers: any = {}) => {
    const response = await fetch(`${API_BASE_URL}/invoices/${id}`, {
        headers: getAuthHeaders(headers)
    });
    if (!response.ok) {
        throw new Error('Failed to fetch invoice details');
    }
    return response.json();
};

export const getAuditLogs = async (params: any = {}, headers: any = {}) => {
    const query = new URLSearchParams(params).toString();
    const response = await fetch(`${API_PREFIX}/api/audit-logs?${query}`, {
        headers: getAuthHeaders(headers)
    });
    if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
    }
    return response.json();
};

export const getConfigs = async (companyId: string, headers: any = {}) => {
    const response = await fetch(`${API_BASE_URL.replace('/zatca', '/erp')}/configs?companyId=${companyId}`, {
        headers: getAuthHeaders(headers)
    });
    if (!response.ok) {
        throw new Error('Failed to fetch ERP configurations');
    }
    return response.json();
};

export const saveERPConfig = async (data: any, headers: any = {}) => {
    const response = await fetch(`${API_BASE_URL.replace('/zatca', '/erp')}/config`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json', ...headers }),
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        throw new Error('Failed to save ERP configuration');
    }
    return response.json();
};

export const renewCertificate = async (data: { vat: string; otp: string; environment: string }) => {
    const response = await fetch(`${API_BASE_URL}/renew`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Certificate renewal failed');
    }
    return response.json();
};
