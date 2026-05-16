
import * as crypto from 'crypto';

const dataToSign = "2026-05-16T10:23:24.884Z50cc009bad986a71ce5945c9c6081f02GET/api/v1/erp/status/550e8400-e29b-41d4-a716-446655440000";
const secret = "sk_live_zatcaconnect_prod_v1";

const expectedSignature = crypto
    .createHmac('sha256', secret.trim())
    .update(dataToSign)
    .digest('hex');

console.log("Calculated Sig:", expectedSignature);
