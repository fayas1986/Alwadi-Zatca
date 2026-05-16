
import { z } from 'zod';

/**
 * Enterprise ZATCA Phase 2 Payload Schema
 * Aligned with "Enterprise Perfect" Postman Collection & ZATCA Standards
 */

export const ZatcaAddressSchema = z.object({
    streetName: z.string().min(1, "Street name is mandatory"),
    buildingNumber: z.string().min(4, "Building number must be 4 digits"),
    additionalNumber: z.string().optional(),
    citySubdivisionName: z.string().min(1, "District is mandatory"),
    cityName: z.string().min(1, "City is mandatory"),
    postalZone: z.string().length(5, "Postal zone must be 5 digits"),
    countryCode: z.string().default("SA"),
});

export const ZatcaPartySchema = z.object({
    name: z.string().min(1),
    vatNumber: z.string().optional(),
    crNumber: z.string().optional(),
    address: ZatcaAddressSchema,
});

export const ZatcaTaxSubtotalSchema = z.object({
    taxableAmount: z.number(),
    taxAmount: z.number(),
    taxCategory: z.object({
        id: z.enum(['S', 'Z', 'E', 'O', 'G', 'H']),
        percent: z.number(),
        reason: z.string().optional()
    })
});

export const ZatcaLineSchema = z.object({
    id: z.string(),
    itemName: z.string(),
    quantity: z.number(),
    unitCode: z.string().default("PCE"),
    unitPrice: z.number(),
    discountAmount: z.number().default(0),
    taxCategory: z.object({
        id: z.enum(['S', 'Z', 'E', 'O', 'G', 'H']),
        percent: z.number()
    }),
    taxAmount: z.number(),
    lineExtensionAmount: z.number(), // Net amount
});

export const EnterpriseZatcaPayloadSchema = z.object({
    invoiceNumber: z.string(),
    uuid: z.string().uuid().optional(),
    invoiceTypeCode: z.enum(['388', '381', '383']).default('388'),
    invoiceSubtype: z.enum(['Standard', 'Simplified', '0100000', '0200000']).default('Simplified'),
    issueDate: z.string(), // YYYY-MM-DD
    issueTime: z.string(), // HH:mm:ss
    documentCurrencyCode: z.string().default("SAR"),
    taxCurrencyCode: z.string().default("SAR"),
    
    supplier: ZatcaPartySchema,
    customer: ZatcaPartySchema.optional(), // Mandatory for Standard
    
    paymentMeans: z.object({
        paymentMeansCode: z.string().default("10"), // 10=Cash, 30=Credit, 42=Bank, 48=Card
    }).optional(),

    billingReference: z.object({
        invoiceNumber: z.string(),
    }).optional(),

    additionalDocumentReferences: z.array(z.object({
        id: z.string(),
        uuid: z.string().optional(),
        value: z.string().optional() // For PIH
    })).optional(),

    taxTotal: z.object({
        taxAmount: z.number(),
        taxSubtotals: z.array(ZatcaTaxSubtotalSchema)
    }),

    legalMonetaryTotal: z.object({
        lineExtensionAmount: z.number(),
        taxExclusiveAmount: z.number(),
        taxInclusiveAmount: z.number(),
        allowanceTotalAmount: z.number().default(0),
        payableAmount: z.number(),
    }),

    invoiceLines: z.array(ZatcaLineSchema),
});

export type EnterpriseZatcaPayload = z.infer<typeof EnterpriseZatcaPayloadSchema>;
