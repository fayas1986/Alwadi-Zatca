const API_BASE_URL = '/api/zatca';

export const onboardSolution = async (data: any) => {
    const response = await fetch(`${API_BASE_URL}/onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
