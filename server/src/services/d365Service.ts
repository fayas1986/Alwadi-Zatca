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

    /**
     * Fetches invoices from D365 F&O OData endpoint.
     */
    static async fetchInvoices(config: D365Config): Promise<ExternalInvoice[]> {
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
                // If it's a 403, we might want to stop early, but let's try next entity just in case
            }
        }

        if (lastError) {
            const errorDetail = lastError.response?.data?.error?.message || lastError.message;
            throw new Error(`D365 Sync Failed: ${errorDetail}`);
        }

        return [];
    }

    /**
     * Pushes ZATCA status back to D365 F&O.
     */
    static async pushStatusUpdate(config: D365Config, update: { invoiceNumber: string; uuid: string; status: string; zatcaResponse?: any }): Promise<void> {
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
                    IntegrationMessage: error.message
                }, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            } catch (fallbackErr) {
                // Ignore fallback error, original error is more important
            }
            
            throw error;
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
