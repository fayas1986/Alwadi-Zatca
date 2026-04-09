import crypto from 'crypto';

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
            return text; // Fallback to raw if logic fails (unsafe but prevents crash in dev)
        }
    }

    /**
     * Decrypts sensitive data
     */
    static decrypt(text: string): string {
        try {
            if (!text.includes(':')) return text; // Assume not encrypted if no IV separator
            const textParts = text.split(':');
            const iv = Buffer.from(textParts.shift()!, 'hex');
            const encryptedText = Buffer.from(textParts.join(':'), 'hex');
            const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString();
        } catch (error) {
            // console.error('[Security] Decryption failed:', error);
            return text; // Return as-is if decryption fails
        }
    }

    /**
     * Verifies an HMAC signature for server-to-server auth
     */
    static verifySignature(secret: string, timestamp: string, nonce: string, method: string, path: string, body: any, signature: string): boolean {
        try {
            const bodyHash = (body && Object.keys(body).length > 0)
                ? crypto.createHash('sha256').update(this.stableStringify(body)).digest('hex')
                : '';

            const dataToSign = `${timestamp}${nonce}${method.toUpperCase()}${path}${bodyHash}`;
            const expectedSignature = crypto
                .createHmac('sha256', secret.trim())
                .update(dataToSign)
                .digest('hex');

            return crypto.timingSafeEqual(
                Buffer.from(signature),
                Buffer.from(expectedSignature)
            );
        } catch (error) {
            return false;
        }
    }

    private static stableStringify(obj: any): string {
        if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
        if (Array.isArray(obj)) return '[' + obj.map(v => this.stableStringify(v)).join(',') + ']';
        const keys = Object.keys(obj).sort();
        return '{' + keys.map(k => `"${k}":${this.stableStringify(obj[k])}`).join(',') + '}';
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
}
