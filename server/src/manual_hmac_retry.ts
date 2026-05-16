
import * as crypto from 'crypto';

const dataToSign = "2026-05-16T10:03:52.096Z60aadd7bc9d099ac58f19098a5c2de7dGET/api/v1/erp/status/550e8400-e29b-41d4-a716-446655440000";
const secret = "sk_live_zatcaconnect_prod_v1";

const expectedSignature = crypto
    .createHmac('sha256', secret.trim())
    .update(dataToSign)
    .digest('hex');

console.log("Calculated Sig:", expectedSignature);
