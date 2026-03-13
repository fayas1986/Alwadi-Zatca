
import { Invoice } from '../types';

// Compute SHA-256 Hash of a string, returning Base64
export const computeSHA256 = async (message: string): Promise<string> => {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
};

// Simulate ECDSA Signing
export const mockSign = async (hash: string, privateKeyId: string): Promise<string> => {
    // In a real scenario, this uses the private key to sign the hash.
    // We simulate a signature by hashing the hash + key ID + salt
    const simKey = `PRIVATE-KEY-${privateKeyId}`;
    const sigRaw = `${hash}-${simKey}-${Date.now()}`;
    return btoa(sigRaw).substring(0, 96) + "="; // Make it look like a fixed length sig
};

// Generate TLV (Tag-Length-Value) for ZATCA QR
export const generateTLV = (tag: number, value: string): Uint8Array => {
    const valBuffer = new TextEncoder().encode(value);
    const len = valBuffer.length;
    
    // Valid for length < 255. ZATCA spec handles variable length, but for mock this suffices.
    const tagBuf = new Uint8Array([tag]);
    const lenBuf = new Uint8Array([len]); 
    
    const combined = new Uint8Array(tagBuf.length + lenBuf.length + valBuffer.length);
    combined.set(tagBuf);
    combined.set(lenBuf, 1);
    combined.set(valBuffer, 2);
    return combined;
};

// Generate Compliant Phase 2 QR Code
export const generateZatcaQR = async (
    invoice: Invoice, 
    hash: string, 
    signature: string, 
    publicKey: string
): Promise<string> => {
    // 1. Seller Name
    // 2. VAT Number
    // 3. Time Stamp
    // 4. Invoice Total (with VAT)
    // 5. VAT Total
    // 6. Hash of XML Invoice
    // 7. ECDSA Signature
    // 8. Public Key
    // 9. ECDSA Signature of CSID (Optional - omitted for simplicity)

    const tags = [
        { id: 1, val: invoice.supplier.name },
        { id: 2, val: invoice.supplier.vatNumber },
        { id: 3, val: invoice.issueDate },
        { id: 4, val: invoice.totalAmount.toFixed(2) },
        { id: 5, val: invoice.vatAmount.toFixed(2) },
        { id: 6, val: hash },
        { id: 7, val: signature },
        { id: 8, val: publicKey } 
    ];

    const arrays: Uint8Array[] = [];
    for (const t of tags) {
        arrays.push(generateTLV(t.id, t.val));
    }

    const totalLength = arrays.reduce((acc, curr) => acc + curr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }

    // Return Base64 of the TLV bytes
    return btoa(String.fromCharCode(...result));
};
