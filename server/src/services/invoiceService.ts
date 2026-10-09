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
     * Creates a new invoice record with standardized metadata and branch validation.
     */
    async createInvoice(data: {
        company_id: number;
        branch_id?: number;
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
        previous_invoice_hash?: string;
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

        // 2. Strict Active Branch & Ownership Validation
        let validatedBranchId: number | null = data.branch_id || null;
        if (validatedBranchId) {
            const branch = await prisma.branch.findUnique({
                where: { id: validatedBranchId }
            });

            if (!branch || branch.is_deleted) {
                throw new Error(`INVALID_BRANCH_ID: Branch ID ${validatedBranchId} does not exist or is deleted.`);
            }

            if (!branch.is_active) {
                throw new Error(`INACTIVE_BRANCH: Cannot create new invoice for inactive branch ${branch.code} (${branch.name}).`);
            }

            if (branch.company_id !== data.company_id) {
                throw new Error(`INVOICE_BRANCH_OWNERSHIP_MISMATCH: Branch ID ${validatedBranchId} (Company ${branch.company_id}) does not belong to invoice company ID ${data.company_id}.`);
            }
        }

        // 3. Ensure consistent metadata structure
        const metadata = {
            ...(data.metadata || {}),
            branch_id: validatedBranchId,
            items: data.items || (data.metadata as any)?.items || [],
            customer: data.customer || (data.metadata as any)?.customer || null,
            erp_raw: (data.metadata as any)?.erp_raw || (data.metadata as any)?.originalPayload || null,
            processed_at: new Date().toISOString()
        };

        console.log(`[InvoiceService] Saving invoice ${data.invoice_number} (Company: ${data.company_id}, Branch: ${validatedBranchId || 'Legal Entity HQ'}, Customer: ${customerId || 'Unknown'}, Items: ${metadata.items.length})`);

        const existingInvoice = await prisma.invoice.findFirst({
            where: {
                company_id: data.company_id,
                invoice_number: data.invoice_number
            }
        });

        const invoiceDataToSave = {
            company_id: data.company_id,
            branch_id: validatedBranchId,
            customer_id: customerId,
            invoice_number: data.invoice_number,
            uuid: data.uuid,
            date: data.date,
            total_amount: data.total_amount,
            tax_amount: data.tax_amount,
            status: data.status,
            type: data.type,
            hash: data.hash,
            previous_invoice_hash: data.previous_invoice_hash || (data.metadata as any)?.previousInvoiceHash || (data.metadata as any)?.pih || 'NWZlY2ViNTZmZGNlNTQ4NDVkZmVhM2YwMzhhNDk4YWUxNmU1NDNlM2MxM2NhNDQ4RGNhZmJjMzkyMTBiYzFlZA==',
            qr_code: data.qr_code,
            xml_payload: data.xml_payload,
            submission_id: data.submission_id,
            submission_response: data.submission_response,
            metadata: metadata as any
        };

        if (existingInvoice) {
            console.log(`[InvoiceService] Updating existing invoice ${data.invoice_number} (ID: ${existingInvoice.id})`);
            return await prisma.invoice.update({
                where: { id: existingInvoice.id },
                data: invoiceDataToSave as any
            });
        }

        return await prisma.invoice.create({
            data: invoiceDataToSave as any
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
    },

    /**
     * Soft deletes an invoice by setting is_deleted = true.
     */
    async softDelete(id: number) {
        return await prisma.invoice.update({
            where: { id },
            data: {
                is_deleted: true,
                deleted_at: new Date()
            }
        });
    }
};

export default InvoiceService;
