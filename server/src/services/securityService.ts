import * as crypto from 'crypto';

const ENCRYPTION_KEY = Buffer.from((process.env.ENCRYPTION_KEY || 'v-7h-Z-9_q-R-4_x-L-1_p-m-9_o-k-2_j').padEnd(32, '0').substring(0, 32), 'utf-8');
const IV_LENGTH = 16;

export class SecurityService {
    /**
     * Encrypts sensitive data (Field-Level Encryption)
     */
    static encrypt(text: string): string {
        try {
            const iv = crypto.randomBytes(IV_LENGTH);
            const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
            let encrypted = cipher.update(text);
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            return iv.toString('hex') + ':' + encrypted.toString('hex');
        } catch (error) {
            console.error('[Security] Encryption failed:', error);
            return text;
        }
    }

    /**
     * Decrypts sensitive data
     */
    static decrypt(text: string): string {
        try {
            if (!text.includes(':')) return text;
            const textParts = text.split(':');
            const iv = Buffer.from(textParts.shift()!, 'hex');
            const encryptedText = Buffer.from(textParts.join(':'), 'hex');
            const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString();
        } catch (error) {
            return text;
        }
    }

    /**
     * Generates an HMAC signature for server-to-server auth
     */
    static generateSignature(secret: string, timestamp: string, nonce: string, method: string, path: string, body: any): string {
        const safeSecret = (secret || '').trim();
        const safeTimestamp = (timestamp || '').trim();
        const safeNonce = (nonce || '').trim();
        const safeMethod = (method || '').trim().toUpperCase();
        const safePath = (path || '').trim();

        // Enforce empty bodyHash for GET requests (GET requests do not have bodies in signature calculation)
        const bodyHash = (safeMethod !== 'GET' && body && typeof body === 'object' && Object.keys(body).length > 0)
            ? crypto.createHash('sha256').update(this.stableStringify(body)).digest('hex')
            : '';

        const dataToSign = `${safeTimestamp}${safeNonce}${safeMethod}${safePath}${bodyHash}`;
        return crypto
            .createHmac('sha256', safeSecret)
            .update(dataToSign)
            .digest('hex');
    }

    /**
     * Verifies an HMAC signature for server-to-server auth
     */
    static verifySignature(secret: string, timestamp: string, nonce: string, method: string, path: string, body: any, signature: string): { isValid: boolean, expectedData?: string, expectedSig?: string } {
        try {
            const expectedSignature = this.generateSignature(secret, timestamp, nonce, method, path, body);
            const safeSignature = (signature || '').trim();

            const safeMethod = (method || '').trim().toUpperCase();
            // Enforce empty bodyHash for GET requests
            const bodyHash = (safeMethod !== 'GET' && body && typeof body === 'object' && Object.keys(body).length > 0)
                ? crypto.createHash('sha256').update(this.stableStringify(body)).digest('hex')
                : '';
            const dataToSign = `${(timestamp || '').trim()}${(nonce || '').trim()}${safeMethod}${(path || '').trim()}${bodyHash}`;

            if (!safeSignature) return { isValid: false, expectedData: dataToSign, expectedSig: expectedSignature };

            if (safeSignature.length !== expectedSignature.length) {
                return { isValid: false, expectedData: dataToSign, expectedSig: expectedSignature };
            }

            const isValid = crypto.timingSafeEqual(
                Buffer.from(safeSignature),
                Buffer.from(expectedSignature)
            );

            return { 
                isValid, 
                expectedData: dataToSign, 
                expectedSig: expectedSignature 
            };
        } catch (error) {
            return { isValid: false };
        }
    }

    /**
     * Signs a payload for outgoing webhooks
     */
    static signPayload(secret: string, payload: any): string {
        const data = JSON.stringify(payload);
        return crypto.createHmac('sha256', secret).update(data).digest('hex');
    }

    /**
     * Protects a payload by encrypting specific fields
     */
    static protect(obj: any, fields: string[]): any {
        const protectedObj = { ...obj };
        for (const field of fields) {
            if (protectedObj[field]) {
                protectedObj[field] = this.encrypt(protectedObj[field]);
            }
        }
        return protectedObj;
    }

    public static stableStringify(obj: any): string {
        if (obj === null) return 'null';
        if (typeof obj !== 'object') return JSON.stringify(obj);

        if (Array.isArray(obj)) {
            const items: string[] = obj.map(item => this.stableStringify(item));
            return '[' + items.join(',') + ']';
        }

        const keys = Object.keys(obj).sort();
        const pairs = keys.map(key => {
            return JSON.stringify(key) + ':' + this.stableStringify(obj[key]);
        });
        return '{' + pairs.join(',') + '}';
    }
}
