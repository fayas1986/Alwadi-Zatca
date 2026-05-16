export class PrivacyService {
    private static readonly ALLOWLIST = new Set([
        // System & Pagination
        'id', 'status', 'timestamp', 'action', 'category', 'name', 'type', 'label', 'value',
        'page', 'limit', 'total', 'count', 'offset', 'sort', 'order', 'version', 'success', 'message',

        // Financial & Metrics
        'amount', 'totalamount', 'total_amount', 'taxamount', 'tax_amount', 'subtotal',
        'sub_total', 'grandtotal', 'grand_total', 'discount', 'price', 'quantity',
        'rate', 'currency', 'total_exclusive', 'total_inclusive', 'tax_exclusive',
        'tax_inclusive', 'payable_amount', 'allowance_total', 'charge_total',
        'vatamount', 'vat_amount', 'taxexclusiveamount', 'tax_exclusive_amount',
        'taxcategory', 'tax_category', 'taxrate', 'tax_rate', 'taxpercent', 'tax_percent',
        'lineextensionamount', 'taxableamount', 'unitprice', 'payableamount',

        // Dates & Times
        'date', 'time', 'issue_date', 'issue_date_time', 'createdat', 'updatedat',
        'created_at', 'updated_at', 'start_date', 'end_date', 'due_date',
        'issuedate', 'supplydate', 'submittedat', 'queuedat',

        // Identity & Contact
        'email', 'user', 'username', 'role', 'phone', 'mobile', 'website',
        'registration_name', 'registered_name', 'business_name', 'trade_name',
        'cr_number', 'vat_number', 'tax_number', 'tax_id', 'vat_registration',
        'vatnumber', 'crnumber', 'registrationname', 'registeredname',

        // Location
        'city', 'country', 'address', 'street', 'building', 'postal_code',
        'district', 'region', 'neighborhood', 'plot_id', 'subdivision',
        'cityname', 'citysubdivisionname', 'postalzone', 'countrycode', 'streetname', 'buildingnumber',

        // ZATCA & Technical
        'invoice_id', 'uuid', 'hash', 'signature', 'qr_code', 'xml_content',
        'zatca_response', 'zatca_status', 'validation_errors', 'warnings',
        'pih', 'icv', 'document_type', 'invoice_type', 'subtype', 'jobid', 'job_id', 'submission_id',
        'qrcode', 'xmlcontent', 'zatcaresponse', 'xmlpayload', 'invoicenumber',
        'invoicesubtype', 'documenttype', 'currencycode', 'branchid', 'events',
        'qrgenerated', 'cleared_xml_payload', 'clearedxmlpayload',

        // Hierarchy
        'company_id', 'organization_id', 'branch_id', 'group_id', 'user_id',
        'resource_id', 'parent_id', 'tenant_id', 'environment',
        'organizationid', 'companyid', 'groupid', 'userid',

        // ERP & Secrets (Allowed for UI configuration)
        'api_key', 'apikey', 'secret', 'token', 'client_id', 'client_secret',
        'access_token', 'refresh_token', 'clientid', 'clientsecret',
        'webhooksecret', 'webhook_secret',

        // Operational & Details
        'history', 'validation_results', 'reporting_status', 'unit_price', 'description',
        'validationresults', 'reportingstatus', 'unitprice', 'line_total', 'linetotal',
        'invoices', 'summary', 'results', 'sync_results', 'note',

        // Objects (Allow nested keys to be processed)
        'company', 'organization', 'branch', 'customer', 'supplier',
        'user', 'group', 'branches', 'stats', 'data', 'items', 'lines', 'details', 'metadata', 'erp_configurations',
        'itemname', 'item_name', 'percent', 'retrycount', 'idempotencykey', 'documentstatus',
        'timeline', 'compliance', 'zatca', 'errors', 'warnings', 'code', 'stage', 'type',
        'payload', 'invoicelines', 'taxsubtotals'
    ]);

    private static readonly MASKLIST = new Set<string>([]);

    private static readonly BLACKLIST = [
        'private_key', 'privateKey', 'password', 'otp', 'auth_token', 
        'certificate', 'bst', 'binarySecurityToken', 'csid'
    ];
    /**
     * Replaces sensitive data with structured masks
     */
    public static mask(value: any): string {
        if (value === null || value === undefined) return 'N/A';
        const str = String(value);
        if (str.length <= 8) return '****';
        return str.substring(0, 4) + '....' + str.substring(str.length - 4);
    }

    /**
     * Scrubs an object based on an allowlist and a strict blacklist
     */
    static scrubObject(data: any): any {
        if (!data || typeof data !== 'object') return data;
        
        if (Array.isArray(data)) {
            return data.map(item => this.scrubObject(item));
        }

        const scrubbed: any = {};
        for (const [key, value] of Object.entries(data)) {
            const lowerKey = key.toLowerCase().trim();
            
            // 1. Strict Blacklist Check (Full Redaction)
            if (this.BLACKLIST.some(f => lowerKey.includes(f.toLowerCase()))) {
                scrubbed[key] = '[REDACTED]';
                continue;
            }

            // 2. Masklist Check (Structured Masking)
            if (this.MASKLIST.has(lowerKey)) {
                scrubbed[key] = this.mask(value);
                continue;
            }

            // 3. Allowlist Check (Full Access)
            const isAllowed = PrivacyService.ALLOWLIST.has(lowerKey) || 
                             lowerKey.startsWith('api_') || 
                             lowerKey.startsWith('erp_') || 
                             lowerKey.startsWith('d365_');

            if (isAllowed) {
                if (typeof value === 'object') {
                    scrubbed[key] = this.scrubObject(value);
                } else {
                    scrubbed[key] = value;
                }
            } else {
                // 4. Fallback: Mask unknown fields
                scrubbed[key] = this.mask(value);
            }
        }
        return scrubbed;
    }

    /**
     * Scrubs a string using regex to catch patterns like Private Keys or OTPs
     */
    static scrubString(text: string): string {
        if (!text) return text;
        
        let scrubbed = text;

        // Redact Private Keys (ZATCA style)
        const privateKeyRegex = /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/gi;
        scrubbed = scrubbed.replace(privateKeyRegex, '[REDACTED_PRIVATE_KEY]');

        // Redact potential OTPs (numeric 6-8 digits in context)
        const otpRegex = /\b\d{6,8}\b/g;
        // Only redact if "otp" or "code" is nearby to avoid redacting invoice numbers
        if (/otp|code|verification/i.test(scrubbed)) {
            scrubbed = scrubbed.replace(otpRegex, '[REDACTED_CODE]');
        }

        // Redact common auth headers/tokens
        const tokenRegex = /(Bearer\s+)[a-zA-Z0-9\-_.]+/gi;
        scrubbed = scrubbed.replace(tokenRegex, '$1[REDACTED_TOKEN]');

        return scrubbed;
    }
}
