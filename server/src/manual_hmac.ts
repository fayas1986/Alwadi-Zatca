
import * as crypto from 'crypto';

const timestamp = "2026-05-16T09:30:18.611Z";
const nonce = "395c956cd2417df8a37b988e9d7b3138";
const method = "GET";
const path = "/api/v1/erp/status/550e8400-e29b-41d4-a716-446655440000";
const bodyHash = "";
const secret = "sk_live_zatcaconnect_prod_v1";

const dataToSign = `${timestamp}${nonce}${method}${path}${bodyHash}`;
const expectedSignature = crypto
    .createHmac('sha256', secret.trim())
    .update(dataToSign)
    .digest('hex');

console.log("Data To Sign:", dataToSign);
console.log("Calculated HMAC:", expectedSignature);
