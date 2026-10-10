import * as crypto from 'crypto';

const KEY_STRING = process.env.ENCRYPTION_KEY || 'v-7h-Z-9_q-R-4_x-L-1_p-m-9_o-k-2_j'; // gitleaks:allow
const DEFAULT_KEY_STRING = 'v-7h-Z-9_q-R-4_x-L-1_p-m-9_o-k-2_j'; // gitleaks:allow

const ENCRYPTION_KEY = Buffer.from(KEY_STRING.padEnd(32, '0').substring(0, 32), 'utf-8');
const DEFAULT_KEY = Buffer.from(DEFAULT_KEY_STRING.padEnd(32, '0').substring(0, 32), 'utf-8');
const IV_LENGTH = 16;

export const encrypt = (text: string) => {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
};

export const decrypt = (text: string) => {
    try {
        if (!text || !text.includes(':')) return text;
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift()!, 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        
        if (iv.length !== IV_LENGTH) {
            return text;
        }

        // Try primary ENCRYPTION_KEY first
        try {
            const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            const resStr = decrypted.toString('utf-8');
            if (resStr) return resStr;
        } catch (e) {
            // Primary key mismatch, continue to fallback
        }

        // Try DEFAULT_KEY
        try {
            const decipher = crypto.createDecipheriv('aes-256-cbc', DEFAULT_KEY, iv);
            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString('utf-8');
        } catch (e) {
            return text;
        }
    } catch (error) {
        return text;
    }
};

