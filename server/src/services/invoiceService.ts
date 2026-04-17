import prisma from '../lib/prisma.js';
import { InvoiceItem } from '../types.js';

/**
 * InvoiceService
 * Centralized service for invoice persistence and metadata management.
 * Ensures consistent data structure across all ingestion paths (ERP Push, API v2, Sync).
 */
export const InvoiceService = {
    /**
     * Resolves a customer ID from name/vat, creating the record if it doesn't exist.
     */
    async getOrCreateCustomerId(companyId: number, customer: { name: string; vatNumber?: string | null }) {
        if (!customer || !customer.name) return null;

        try {
            // Normalize name for lookup
            const name = customer.name.trim();
            const vat = customer.vatNumber?.trim();

            const existing = await prisma.customer.findFirst({
                where: {
                    company_id: companyId,
                    name: name,
                    vat_number: vat || null
                }
            });


            if (existing) return existing.id;

            console.log(`[InvoiceService] Creating new customer: ${name}`);
            const created = await prisma.customer.create({
                data: {
                    company_id: companyId,
                    name: name,
                    vat_number: vat || null
                }
            });
            return created.id;
        } catch (error) {
            console.error('[InvoiceService] Error in getOrCreateCustomerId:', error);
            return null;
        }
    },

    /**
     * Creates a new invoice record with standardized metadata.
     */
    async createInvoice(data: {
        company_id: number;
        customer_id?: number;
        customer?: { name: string; vatNumber?: string | null };
        invoice_number: string;
        uuid: string;
        date: Date;
        total_amount: number;
        tax_amount: number;
        status: any;
        type: 'B2B' | 'B2C';
        hash: string;
        qr_code: string;
        xml_payload: string;
        submission_id?: string;
        submission_response?: string;
        metadata?: any;
        items?: InvoiceItem[];
    }) {
        let customerId = data.customer_id;

        // 1. Auto-resolve customer if details provided but ID missing
        if (!customerId && data.customer) {
            customerId = await this.getOrCreateCustomerId(data.company_id, data.customer) || undefined;
        }

        // 2. Ensure consistent metadata structure
        const metadata = {
            ...(data.metadata || {}),
            // Prioritize items passed directly
            items: data.items || (data.metadata as any)?.items || [],
            // Redundant customer info for UI fallback
            customer: data.customer || (data.metadata as any)?.customer || null,
            // Keep track of source/raw data
            erp_raw: (data.metadata as any)?.erp_raw || (data.metadata as any)?.originalPayload || null,
            processed_at: new Date().toISOString()
        };

        console.log(`[InvoiceService] Saving invoice ${data.invoice_number} (Customer: ${customerId || 'Unknown'}, Items: ${metadata.items.length})`);

        return await prisma.invoice.create({
            data: {
                company_id: data.company_id,
                customer_id: customerId,
                invoice_number: data.invoice_number,
                uuid: data.uuid,
                date: data.date,
                total_amount: data.total_amount,
                tax_amount: data.tax_amount,
                status: data.status,
                type: data.type,
                hash: data.hash,
                qr_code: data.qr_code,
                xml_payload: data.xml_payload,
                submission_id: data.submission_id,
                submission_response: data.submission_response,
                metadata: metadata as any
            }
        });
    },


    /**
     * Updates an existing invoice, preserving existing metadata items if not provided.
     */
    async updateInvoice(id: number, data: Partial<any>) {
        if (data.metadata || data.items) {
            const existing = await prisma.invoice.findUnique({ where: { id } });
            const existingMetadata = (existing?.metadata as any) || {};
            
            data.metadata = {
                ...existingMetadata,
                ...(data.metadata || {}),
                items: data.items || data.metadata?.items || existingMetadata.items || []
            };
            delete data.items;
        }

        return await prisma.invoice.update({
            where: { id },
            data
        });
    }
};

export default InvoiceService;
