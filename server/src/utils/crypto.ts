import crypto from 'crypto';

// Ensure 32 bytes key for AES-256
const ENCRYPTION_KEY = Buffer.from((process.env.ENCRYPTION_KEY || 'v-7h-Z-9_q-R-4_x-L-1_p-m-9_o-k-2_j').padEnd(32, '0').substring(0, 32), 'utf-8');
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
            console.warn('[Crypto Utility] Invalid IV length, returning raw text');
            return text;
        }

        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        console.error('[Crypto Utility] Decryption failed, returning raw text');
        return text;
    }
};
