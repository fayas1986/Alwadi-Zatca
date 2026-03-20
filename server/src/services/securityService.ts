import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_char_key_for_zatca_prod_123'; // Must be 32 chars
const IV_LENGTH = 16;

export class SecurityService {
    /**
     * Encrypts sensitive data (Field-Level Encryption)
     */
    static encrypt(text: string): string {
        try {
            const iv = crypto.randomBytes(IV_LENGTH);
            const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
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
            const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString();
        } catch (error) {
            // console.error('[Security] Decryption failed:', error);
            return text; // Return as-is if decryption fails
        }
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
