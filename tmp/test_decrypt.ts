import crypto from 'crypto';

const OLD_KEY = 'v-7h-Z-9_q-R-4_x-L-1_p-m-9_o-k-2_j'.padEnd(32, '0').substring(0, 32);
const NEW_KEY = 'default_32_char_key_for_zatca_prod_123';
const ENCRYPTED_PWD = '8642d6c3939c52b74384679481d4d52f:829fff576e83980385724205404be66a';

function decrypt(text, key) {
    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) {
        return 'FAILED: ' + e.message;
    }
}

console.log('Decrypting with OLD_KEY:', decrypt(ENCRYPTED_PWD, OLD_KEY));
console.log('Decrypting with NEW_KEY:', decrypt(ENCRYPTED_PWD, NEW_KEY));
