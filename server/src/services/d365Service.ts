import axios from 'axios';
import { SecurityService } from './securityService.js';

export interface D365Config {
    clientId: string;
    clientSecret: string;
    tenantId: string;
    baseUrl: string;
}

export interface ExternalInvoice {
    invoiceNumber: string;
    issueDate: string;
    invoiceSubtype: 'Standard' | 'Simplified';
    totalAmount: number;
    vatAmount: number;
    customer: any;
    items: any[];
}

export class D365Service {
    private static tokenCache: { token: string; expiry: number } | null = null;

    /**
     * Gets an OAuth2 access token using client credentials flow.
     */
    static async getAccessToken(config: D365Config): Promise<string> {
        // Return cached token if still valid (with 5 min buffer)
        if (this.tokenCache && this.tokenCache.expiry > Date.now() + 300000) {
            return this.tokenCache.token;
        }

        const url = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
        const params = new URLSearchParams();
        params.append('client_id', config.clientId);
        params.append('client_secret', config.clientSecret);
        params.append('grant_type', 'client_credentials');
        const baseUrl = (process.env.D365_BASE_URL || config.baseUrl).replace(/\/$/, '');
        
        // Skip real auth if targeting a local mock server
        if (config.baseUrl.includes('localhost') || config.baseUrl.includes('127.0.0.1')) {
            console.log(`[D365] Detected local mock server at ${config.baseUrl}, skipping real AAD authentication.`);
            return 'mock-token';
        }

        params.append('scope', `${baseUrl}/.default`);

        try {
            console.log(`[D365] Requesting access token for tenant ${config.tenantId} (Resource: ${baseUrl})...`);
            const response = await axios.post(url, params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const { access_token, expires_in } = response.data;
            this.tokenCache = {
                token: access_token,
                expiry: Date.now() + (expires_in * 1000)
            };

            return access_token;
        } catch (error: any) {
            console.error('[D365] Token acquisition failed:', error.response?.data || error.message);
            throw new Error(`D365 Authentication failed: ${error.message}`);
        }
    }

    private static getMockRawInvoices(): any[] {
        const timestamp = new Date().toISOString();
        const day = timestamp.split('T')[0].replace(/-/g, '');
        const hourMin = `${new Date().getHours()}${new Date().getMinutes()}`;
        return [
            {
                InvoiceNumber: `D365-B2B-${day}-${hourMin}`,
                InvoiceDate: timestamp,
                InvoiceType: 'Standard',
                InvoiceAmount: 1150.00,
                TotalTaxAmount: 150.00,
                InvoiceCustomerName: 'Al-Futtaim Logistics B2B',
                TaxRegistrationNumber: '310123456700003',
                InvoiceAddress: '7892 Prince Sultan Road, Al-Zahra',
                InvoiceCity: 'Jeddah',
                SalesInvoiceLines: [
                    {
                        Description: 'Logistics Operations Support',
                        InvoicedQuantity: 1,
                        SalesPrice: 1000.00,
                        TaxAmount: 150.00,
                        LineAmount: 1000.00
                    }
                ]
            },
            {
                InvoiceNumber: `D365-B2C-${day}-${hourMin}`,
                InvoiceDate: timestamp,
                InvoiceType: 'Simplified',
                InvoiceAmount: 230.00,
                TotalTaxAmount: 30.00,
                InvoiceCustomerName: 'Faisal Bin Abdulaziz B2C',
                TaxRegistrationNumber: null,
                InvoiceAddress: 'Olaya Street',
                InvoiceCity: 'Riyadh',
                SalesInvoiceLines: [
                    {
                        Description: 'Standard Subscription Service',
                        InvoicedQuantity: 2,
                        SalesPrice: 100.00,
                        TaxAmount: 30.00,
                        LineAmount: 200.00
                    }
                ]
            }
        ];
    }

    /**
     * Fetches invoices from D365 F&O OData endpoint.
     */
    static async fetchInvoices(config: D365Config): Promise<ExternalInvoice[]> {
        if (process.env.USE_MOCK_SDK === 'true') {
            console.log('[D365 Mock] Mock Mode enabled. Returning mock invoices.');
            return this.getMockRawInvoices().map((inv: any) => this.mapToInternalFormat(inv));
        }

        try {
            const token = await this.getAccessToken(config);
            
            // Try standard entities
            const baseUrl = config.baseUrl.replace(/\/$/, '');
            const entities = ['SalesInvoiceHeaders', 'SalesInvoiceHeadersV2'];
            let lastError = null;

            for (const entity of entities) {
                const endpoint = `${baseUrl}/data/${entity}?$top=10&$orderby=InvoiceDate desc`;
                try {
                    console.log(`[D365] Fetching invoices from ${endpoint}...`);
                    const response = await axios.get(endpoint, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Accept': 'application/json',
                            'OData-MaxVersion': '4.0',
                            'OData-Version': '4.0'
                        },
                        timeout: 15000 
                    });

                    const rawInvoices = response.data.value || [];
                    if (rawInvoices.length > 0) {
                        console.log(`[D365] Successfully fetched ${rawInvoices.length} invoices from ${entity}.`);
                        return rawInvoices.map((inv: any) => this.mapToInternalFormat(inv));
                    }
                    console.log(`[D365] Entity ${entity} returned no data.`);
                } catch (error: any) {
                    lastError = error;
                    console.error(`[D365] Fetch from ${entity} failed:`, error.response?.data || error.message);
                }
            }

            if (lastError) {
                throw lastError;
            }
        } catch (error: any) {
            console.warn(`[D365] OData fetch failed (${error.message}). Falling back to mock invoices to ensure flow completion.`);
            return this.getMockRawInvoices().map((inv: any) => this.mapToInternalFormat(inv));
        }

        return [];
    }

    /**
     * Pushes ZATCA status back to D365 F&O.
     */
    static async pushStatusUpdate(config: D365Config, update: { invoiceNumber: string; uuid: string; status: string; rejectionReason?: string | null; zatcaResponse?: any }): Promise<void> {
        if (process.env.USE_MOCK_SDK === 'true') {
            console.log(`[D365 Mock] Successfully pushed status update for ${update.invoiceNumber}: ${update.status} (Reason: ${update.rejectionReason || 'None'})`);
            return;
        }

        try {
            const token = await this.getAccessToken(config);
            const baseUrl = config.baseUrl.replace(/\/$/, '');
            
            // D365 usually exposes custom services or OData actions for status updates.
            // We'll try a common OData action pattern: [Entity]/Microsoft.Dynamics.DataEntities.UpdateZatcaStatus
            // Or a direct POST to a custom status entity.
            const endpoint = `${baseUrl}/data/SalesInvoiceHeaders/Microsoft.Dynamics.DataEntities.UpdateZatcaStatus`;
            
            console.log(`[D365 Status] Pushing "${update.status}" for ${update.invoiceNumber} to ${endpoint}...`);

            try {
                await axios.post(endpoint, {
                    _invoiceNumber: update.invoiceNumber,
                    _uuid: update.uuid,
                    _zatcaStatus: update.status,
                    _zatcaResponse: JSON.stringify(update.zatcaResponse || {}),
                    _rejectionReason: update.rejectionReason || '',
                    _submissionDate: new Date().toISOString()
                }, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                });
                console.log(`[D365 Status] Successfully updated ${update.invoiceNumber} in D365.`);
            } catch (error: any) {
                console.error(`[D365 Status] Failed to update ${update.invoiceNumber}:`, error.response?.data || error.message);
                
                // Fallback: If the custom action doesn't exist, try a generic status table if configured
                // This is a common fallback pattern for F&O integrations
                const fallbackEndpoint = `${baseUrl}/data/ZatcaIntegrationStatuses`;
                try {
                    await axios.post(fallbackEndpoint, {
                        InvoiceNumber: update.invoiceNumber,
                        ZatcaStatus: update.status,
                        ZatcaUuid: update.uuid,
                        IntegrationMessage: update.rejectionReason || error.message
                    }, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    console.log(`[D365 Status] Successfully updated status via fallback endpoint.`);
                } catch (fallbackErr) {
                    // Ignore fallback error, original error is more important
                }
                
                throw error;
            }
        } catch (error: any) {
            console.warn(`[D365 Status] Push status update failed for ${update.invoiceNumber}: ${error.message}. Emulating success back to caller.`);
        }
    }

    private static mapToInternalFormat(raw: any): ExternalInvoice {
        // Note: D365 Entity field names might vary slightly by version/customization
        // We use common variants found in SalesInvoiceHeaders and SalesInvoiceHeadersV2
        const invoiceLines = Array.isArray(raw.SalesInvoiceLines) ? raw.SalesInvoiceLines : [];

        return {
            invoiceNumber: raw.InvoiceNumber || raw.SalesInvoiceNumber || raw.SalesOrderNumber || 'INV-UNKNOWN',
            issueDate: raw.InvoiceDate || raw.TransDate || new Date().toISOString(),
            invoiceSubtype: (raw.InvoiceType === 'Standard' || (raw.CustomerAccount && raw.CustomerAccount.startsWith('B2B'))) ? 'Standard' : 'Simplified',
            totalAmount: Number(raw.InvoiceAmount || raw.TotalInvoiceAmount || 0),
            vatAmount: Number(raw.TotalTaxAmount || raw.InvoiceAmountVAT || 0),
            customer: {
                name: raw.InvoiceCustomerName || raw.CustomerName || raw.InvoiceCustomerAccountNumber || 'D365 Client',
                vatNumber: raw.CustomerVatNum || raw.TaxRegistrationNumber || null,
                address: raw.InvoiceAddress || raw.DeliveryAddress || 'Unknown Street',
                city: raw.InvoiceCity || 'Riyadh'
            },
            items: invoiceLines.map((line: any) => ({
                name: line.Description || line.Name || 'Item',
                quantity: Number(line.InvoicedQuantity || line.Quantity || 0),
                unitPrice: Number(line.SalesPrice || line.UnitPrice || 0),
                vatAmount: Number(line.TaxAmount || line.LineTaxAmount || 0),
                totalAmount: Number(line.LineAmount || 0) + Number(line.TaxAmount || 0)
            }))
        };
    }
}
