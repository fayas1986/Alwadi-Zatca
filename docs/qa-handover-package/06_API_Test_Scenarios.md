# API Test Scenarios & Automation Matrix
## ZatcaConnect: ZATCA Phase-2 e-Invoicing Compliance Platform

| Metadata | Details |
| :--- | :--- |
| **Document Version** | 1.0.0-RC1 |
| **Target API Base URL** | `http://localhost:3001` / `https://gateway.easyleasetax.com` |
| **Status** | Approved for QA Handover |
| **Author / Generator** | Antigravity (`api-testing` skill) |

---

## 1. Overview & Postman Setup

This document defines the REST API test scenarios for verifying the ZatcaConnect middleware gateway. QA engineers can execute these tests via cURL, automated CI/CD pipelines, or by importing the pre-built Postman collection located in the repository root (`postman_collection_v2.json`).

### Postman Environment Setup:
1. Import `postman_collection_v2.json` into Postman.
2. Import `postman_environment_simulation.json` for internal testing without ZATCA credentials.
3. Configure environment variables:
   * `base_url`: `http://localhost:3001`
   * `api_key`: `sk_sim_easylease_mock_v1`
   * `jwt_token`: `<obtain_via_login_endpoint>`

---

## 2. Authentication & HMAC Pre-Request Script

For all ERP endpoints (`/api/erp/*` and `/api/v2/erp/*`), requests must be dynamically signed using HMAC-SHA256. When building custom automation scripts, apply the following JavaScript Pre-Request Script logic:

```javascript
const crypto = require('crypto');

function stableStringify(obj) {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return '[' + obj.map(v => stableStringify(v)).join(',') + ']';
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => `"${k}":${stableStringify(obj[k])}`).join(',') + '}';
}

const apiKey = pm.environment.get("api_key");
const timestamp = new Date().toISOString();
const nonce = Math.random().toString(36).substring(2, 15);
const method = pm.request.method;
const path = pm.request.url.getPath();
const rawBody = pm.request.body.toString();
const jsonBody = rawBody ? JSON.parse(rawBody) : {};

const bodyHash = crypto.createHash('sha256').update(stableStringify(jsonBody)).digest('hex');
const stringToSign = `${timestamp}${nonce}${method}${path}${bodyHash}`;
const signature = crypto.createHmac('sha256', apiKey).update(stringToSign).digest('hex');

pm.request.headers.add({ key: 'x-api-key', value: apiKey });
pm.request.headers.add({ key: 'x-signature', value: signature });
pm.request.headers.add({ key: 'x-timestamp', value: timestamp });
pm.request.headers.add({ key: 'x-nonce', value: nonce });
```

---

## 3. Comprehensive API Test Scenarios Table

| Scenario ID | Endpoint | Method | Test Type | Required Headers | Payload / Params | Expected Status & Assertion Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **API-001** | `/api/auth/login` | `POST` | Positive | `Content-Type: application/json` | `{"email":"admin@easylease.com", "password":"password123"}` | **200 OK**. Assert response contains `token` (JWT) and `user.role == "IT_ADMIN"`. |
| **API-002** | `/api/auth/login` | `POST` | Negative | `Content-Type: application/json` | `{"email":"admin@easylease.com", "password":"wrongpassword"}` | **401 Unauthorized**. Assert response error message indicates invalid credentials. |
| **API-003** | `/api/erp/invoices/submit` | `POST` | Positive | `x-api-key`, `x-signature`, `x-timestamp`, `x-nonce` | B2B Standard Invoice JSON (`invoiceType: "388"`, `subtype: "Standard"`, valid `buyer.vatNumber`). | **200 OK**. Assert `status == "CLEARED"`, `qrCode` is non-empty, and `zatcaResponse` contains cryptographic stamp. |
| **API-004** | `/api/erp/invoices/submit` | `POST` | Positive | `x-api-key`, `x-signature`, `x-timestamp`, `x-nonce` | B2C Simplified Invoice JSON (`invoiceType: "388"`, `subtype: "Simplified"`). | **200 OK**. Assert `status == "REPORTED"` (or `PENDING` if backgrounded), and `qrCode` contains valid Base64 TLV string. |
| **API-005** | `/api/erp/invoices/submit` | `POST` | Security | `x-api-key`, `x-timestamp`, `x-nonce` (Missing `x-signature`) | Valid B2B Invoice JSON. | **401 Unauthorized**. Assert response indicates "Missing HMAC signature". |
| **API-006** | `/api/erp/invoices/submit` | `POST` | Security | `x-api-key`, `x-signature`, `x-timestamp`, `x-nonce` | Valid B2B Invoice JSON, but calculate `x-signature` using `timestamp` set to 10 minutes ago. | **401 Unauthorized**. Assert response indicates "Request timestamp expired". Replay attack blocked. |
| **API-007** | `/api/erp/invoices/submit` | `POST` | Security | All valid HMAC headers | Valid B2B Invoice JSON sent twice within 30 seconds with identical `x-nonce`. | **401 Unauthorized** on 2nd request. Assert response indicates "Duplicate request nonce detected". |
| **API-008** | `/api/erp/invoices/submit` | `POST` | Validation | All valid HMAC headers | B2B Invoice JSON missing mandatory `buyer.vatNumber`. | **400 Bad Request**. Assert error message specifies missing mandatory Buyer VAT for B2B standard invoices. |
| **API-009** | `/api/zatca/onboard` | `POST` | Positive | `Authorization: Bearer <JWT>` | `{"companyId": 1, "csr": "<Base64_CSR>", "otp": "123456"}` | **200 OK**. Assert response returns `complianceCSID` and `requestId`. |
| **API-010** | `/api/zatca/dlq/reprocess/:id`| `POST` | Resilience | `Authorization: Bearer <JWT>` | URL parameter `:id` pointing to an invoice in `DLQ` status. | **200 OK**. Assert invoice status updates from `DLQ` to `CLEARED` or `REPORTED`. |

---

## 4. Executable cURL Test Automation Scripts

### 4.1 Test Health & Simulator Ping
```bash
# Verify Mock Server Status
curl -i -X GET "http://localhost:3001/api/erp/mock-server"

# Ping ZATCA Environment Status
curl -i -X GET "http://localhost:3001/api/zatca/ping/SIMULATION" \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>"
```

### 4.2 Simulate B2C Invoice Submission (with Manual HMAC in Bash)
For automated shell pipelines, use the included verification script in the workspace:
```bash
# Run existing verification script to test API endpoint
npx tsx verify_v1_api.ts
```

Or execute directly via Node.js one-liner:
```bash
node -e '
const axios = require("axios");
const crypto = require("crypto");
const key = "sk_sim_easylease_mock_v1";
const ts = new Date().toISOString();
const nonce = "test_" + Date.now();
const payload = {
  invoiceNumber: "SIM-CURL-01",
  issueDate: "2026-07-02",
  invoiceType: "388",
  invoiceSubtype: "Simplified",
  totalAmount: 115.00,
  taxAmount: 15.00,
  seller: { name: "EasyLease", vatNumber: "300000000000003" },
  items: [{ name: "Service", quantity: 1, unitPrice: 100, taxRate: 15, taxAmount: 15, totalAmount: 115 }]
};
const bodyStr = JSON.stringify(payload);
const hash = crypto.createHash("sha256").update(bodyStr).digest("hex");
const sig = crypto.createHmac("sha256", key).update(ts + nonce + "POST/api/erp/invoices/submit" + hash).digest("hex");
axios.post("http://localhost:3001/api/erp/invoices/submit", payload, {
  headers: { "x-api-key": key, "x-signature": sig, "x-timestamp": ts, "x-nonce": nonce }
}).then(r => console.log("SUCCESS:", r.data)).catch(e => console.error("ERROR:", e.response ? e.response.data : e.message));
'
```
