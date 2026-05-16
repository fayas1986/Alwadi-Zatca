
import * as crypto from 'crypto';

const dataToSign = "2026-05-16T09:40:59.225Z346db5e2b3bd2bbf507e1acc59a2fa13GET/api/v1/erp/status/550e8400-e29b-41d4-a716-446655440000";
const secret = "sk_live_zatcaconnect_prod_v1";

const expectedSignature = crypto
    .createHmac('sha256', secret.trim())
    .update(dataToSign)
    .digest('hex');

console.log("Calculated Sig for Status Check:", expectedSignature);
