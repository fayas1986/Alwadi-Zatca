
import * as crypto from 'crypto';

const dataToSign = "2026-05-16T10:18:43.037Z455924ddcf32edb1532fa36da61390c4GET/api/v1/erp/status/550e8400-e29b-41d4-a716-446655440000";
const secret = "sk_live_zatcaconnect_prod_v1";

const expectedSignature = crypto
    .createHmac('sha256', secret.trim())
    .update(dataToSign)
    .digest('hex');

console.log("Calculated Sig (Live Key):", expectedSignature);

const testSecret = "sk_mic_test_cdl1yc2uoyapqj86";
const testSignature = crypto
    .createHmac('sha256', testSecret.trim())
    .update(dataToSign)
    .digest('hex');

console.log("Calculated Sig (Test Key):", testSignature);
