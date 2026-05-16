import crypto from 'crypto';

/**
 * ZATCA QR Code TLV Tags (Requirement 2)
 */
export enum ZatcaQRTag {
    SELLER_NAME = 1,
    VAT_NUMBER = 2,
    TIMESTAMP = 3,
    TOTAL_AMOUNT = 4,
    VAT_AMOUNT = 5,
    XML_HASH = 6,
    ECDSA_SIGNATURE = 7,
    ECDSA_PUBLIC_KEY = 8,
    CERTIFICATE_SIGNATURE = 9 // For Simplified Invoices
}

export class ZatcaQRService {
    /**
     * Generates a TLV (Tag-Length-Value) encoded Base64 string for ZATCA QR Code
     */
    static generateTLV(tags: Record<number, string | Buffer>): string {
        const buffers: Buffer[] = [];

        // Deterministic Ordering: Always sort tags by ID (Requirement: Scanner Compatibility)
        const sortedTags = Object.keys(tags)
            .map(k => parseInt(k))
            .sort((a, b) => a - b);

        for (const tag of sortedTags) {
            const value = tags[tag];
            const valBuffer = Buffer.isBuffer(value) ? value : Buffer.from(value.toString(), 'utf-8');
            
            // Tag (1 byte)
            const tagBuf = Buffer.alloc(1);
            tagBuf.writeUInt8(tag);
            
            // Length (1 byte)
            const lenBuf = Buffer.alloc(1);
            lenBuf.writeUInt8(valBuffer.length);
            
            buffers.push(tagBuf, lenBuf, valBuffer);
        }

        return Buffer.concat(buffers).toString('base64');
    }

    /**
     * Helper to prepare the 9-tag record for ZATCA Phase 2
     */
    static preparePhase2Tags(data: {
        sellerName: string;
        vatNumber: string;
        timestamp: string;
        totalAmount: string;
        vatAmount: string;
        xmlHash: string;
        signature: string | Buffer;
        publicKey: string | Buffer;
        certSignature?: string | Buffer;
    }): Record<ZatcaQRTag, string | Buffer> {
        const tags: Record<number, string | Buffer> = {
            [ZatcaQRTag.SELLER_NAME]: data.sellerName,
            [ZatcaQRTag.VAT_NUMBER]: data.vatNumber,
            [ZatcaQRTag.TIMESTAMP]: data.timestamp,
            [ZatcaQRTag.TOTAL_AMOUNT]: data.totalAmount,
            [ZatcaQRTag.VAT_AMOUNT]: data.vatAmount,
            [ZatcaQRTag.XML_HASH]: data.xmlHash,
            [ZatcaQRTag.ECDSA_SIGNATURE]: data.signature,
            [ZatcaQRTag.ECDSA_PUBLIC_KEY]: data.publicKey
        };

        if (data.certSignature) {
            tags[ZatcaQRTag.CERTIFICATE_SIGNATURE] = data.certSignature;
        }

        return tags as Record<ZatcaQRTag, string | Buffer>;
    }
}
