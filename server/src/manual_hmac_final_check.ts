
import * as crypto from 'crypto';

const dataToSign = "2026-05-16T10:07:20.378Z4449e5d06a95f6785cf75402bf562dc9GET/api/v1/erp/status/550e8400-e29b-41d4-a716-446655440000";
const secret = "sk_live_zatcaconnect_prod_v1";

const expectedSignature = crypto
    .createHmac('sha256', secret.trim())
    .update(dataToSign)
    .digest('hex');

console.log("Calculated Sig:", expectedSignature);
