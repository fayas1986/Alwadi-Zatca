
import * as crypto from 'crypto';

const dataToSign = "2026-05-16T09:34:11.383Z482e9b7ea5c7a8d6573d37ba509e287dGET/api/v1/erp/status/550e8400-e29b-41d4-a716-446655440000";
const secret = "sk_live_zatcaconnect_prod_v1";

const expectedSignature = crypto
    .createHmac('sha256', secret.trim())
    .update(dataToSign)
    .digest('hex');

console.log("Calculated Sig:", expectedSignature);
