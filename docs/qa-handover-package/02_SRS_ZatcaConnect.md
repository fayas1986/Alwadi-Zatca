# Software Requirements Specification (SRS)
## ZatcaConnect: ZATCA Phase-2 e-Invoicing Compliance Platform

| Metadata | Details |
| :--- | :--- |
| **Document Version** | 1.0.0-RC1 |
| **System Name** | ZatcaConnect Middleware & API Gateway |
| **Status** | Approved for QA Handover |
| **Author / Generator** | Antigravity (`srs-generator` skill) |

---

## 1. Introduction & Scope

This Software Requirements Specification (SRS) defines the functional requirements, architectural interfaces, data models, and cryptographic processing rules for the **ZatcaConnect** application. This specification serves as the authoritative verification baseline for QA engineers, test automation engineers, and compliance auditors.

---

## 2. Functional Requirements

### 2.1 CSID Onboarding & Certificate Management
* **`REQ-ONB-01`**: The system MUST generate a 256-bit Elliptic Curve (secp256k1) keypair locally upon initiating onboarding for a company VAT number and environment.
* **`REQ-ONB-02`**: The system MUST construct an X.509 Certificate Signing Request (CSR) in Base64 format containing:
  * `CN` (Common Name): Solution/Device Identifier
  * `C`: Country (`SA`)
  * `O`: Organization Name
  * `OU`: Organizational Unit Name
  * `UID`: Company Tax Registration Number (15 digits, starting and ending with `3`)
  * `serialNumber`: Device Serial Number + Manufacturer Name + Model
* **`REQ-ONB-03`**: When a valid OTP and Base64 CSR are posted to `/api/zatca/onboard` (or compliance endpoint), the system MUST call ZATCA's `/csid/compliance` endpoint, store the returned `complianceCSID` and `requestId`, and set the certificate status to `ACTIVE`.
* **`REQ-ONB-04`**: Upon successful compliance testing, the system MUST exchange `requestId` at ZATCA's `/csid/production` endpoint, encrypt the returned `productionCSID`, `secret`, and private key using AES-256-GCM, and store them in the `certificates` database table.

### 2.2 Invoice Processing & Cryptographic Stamping
* **`REQ-INV-01`**: When an invoice JSON payload is received via `/api/erp/invoices/submit` or `/api/v2/erp/invoices`, the system MUST validate all mandatory fields (`invoiceNumber`, `issueDate`, `seller.vatNumber`, `items`, `totalAmount`, `taxAmount`).
* **`REQ-INV-02`**: The system MUST generate an XML document complying with ZATCA UBL 2.1 schemas (`388` for standard/simplified invoices, `381` for credit notes, `383` for debit notes).
* **`REQ-INV-03`**: The system MUST calculate the invoice SHA-256 hash using the formula: `hash = Base64(SHA256(XML))`.
* **`REQ-INV-04`**: For sequential invoice chaining, the system MUST query the `invoices` table for the last successful invoice for the same `company_id` and embed its `hash` into the current invoice's `<cac:AdditionalDocumentReference>` tag. If no previous invoice exists, it MUST use the ZATCA default base64 zero-hash: `NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==`.
* **`REQ-INV-05`**: For B2C Simplified Invoices, the system MUST generate a Type-Length-Value (TLV) Base64 encoded QR string containing Tags 1 through 9 and embed it in the XML and database record.

### 2.3 ERP Integration Gateway & Security
* **`REQ-ERP-01`**: All requests to ERP endpoints MUST include mandatory authentication headers: `x-api-key`, `x-signature`, `x-timestamp`, and `x-nonce`.
* **`REQ-ERP-02`**: The system MUST reject any request where `x-timestamp` deviates by more than 300 seconds (5 minutes) from server UTC time to prevent replay attacks.
* **`REQ-ERP-03`**: The system MUST calculate the expected HMAC-SHA256 signature by taking `stableStringify(body)`, hashing it via SHA256 (`bodyHash`), constructing the signing string `Timestamp + Nonce + Method + Path + BodyHash`, and hashing via HMAC-SHA256 using the ERP configuration API Key. If `x-signature` does not match, return `401 Unauthorized`.
* **`REQ-ERP-04`**: The system MUST support environment isolation based on API key prefix: keys starting with `sk_sim_` route to `SIMULATION`, `sk_sbox_` to `SANDBOX`, and `sk_live_` to `PRODUCTION`.

### 2.4 Error Handling & Dead Letter Queue (DLQ)
* **`REQ-ERR-01`**: If ZATCA API returns a synchronous validation error (HTTP 400/422), the system MUST mark invoice status as `FAILED`, store raw JSON validation errors in `error_log`, and return details to the ERP.
* **`REQ-ERR-02`**: If ZATCA API experiences a network outage or HTTP 5xx error, the system MUST set invoice status to `PENDING` or `DLQ` and schedule an automatic retry with exponential backoff (`retry_count`, `next_attempt_at`).
* **`REQ-ERR-03`**: IT/Finance Admins MUST be able to retrigger processing of stuck DLQ invoices via `POST /api/zatca/dlq/reprocess/:invoiceId`.

---

## 3. Data Models & Database Schemas (Prisma ORM)

### 3.1 `companies` & `certificates`
```sql
CREATE TABLE companies (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    vat_number TEXT UNIQUE NOT NULL, -- 15 digits starting/ending with 3
    cr_number TEXT NOT NULL,
    registered_name TEXT NOT NULL,
    environment TEXT DEFAULT 'SANDBOX', -- 'SANDBOX' | 'SIMULATION' | 'PRODUCTION'
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE certificates (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    type TEXT NOT NULL, -- 'COMPLIANCE' | 'PRODUCTION'
    certificate TEXT NOT NULL, -- Base64 X.509
    private_key TEXT NOT NULL, -- AES-256 encrypted secp256k1 private key
    public_key TEXT NOT NULL,
    csid TEXT, -- Encrypted CSID token
    secret TEXT, -- Encrypted ZATCA API secret
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 3.2 `erp_configurations`
```sql
CREATE TABLE erp_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id INTEGER NOT NULL REFERENCES companies(id),
    type TEXT NOT NULL, -- 'D365' | 'ODOO' | 'SAP' | 'CUSTOM'
    base_url TEXT NOT NULL,
    api_key TEXT, -- Connector secret key (e.g., sk_sim_..., sk_sbox_...)
    sync_interval INTEGER DEFAULT 30,
    environment TEXT, -- Target ZATCA environment
    is_active BOOLEAN DEFAULT true
);
```

### 3.3 `invoices`
```sql
CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    uuid UUID NOT NULL DEFAULT gen_random_uuid(),
    invoice_number TEXT NOT NULL,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    total_amount DECIMAL(12,2) NOT NULL,
    tax_amount DECIMAL(12,2) NOT NULL,
    status TEXT DEFAULT 'PENDING', -- 'PENDING' | 'PROCESSING' | 'CLEARED' | 'REPORTED' | 'FAILED' | 'DLQ'
    type TEXT DEFAULT 'B2B', -- 'B2B' | 'B2C' | 'SIMPLIFIED'
    hash TEXT, -- Current invoice SHA-256 Base64 hash
    previous_invoice_hash TEXT, -- Chaining hash of previous invoice
    xml_payload TEXT, -- Generated UBL 2.1 XML
    cleared_xml_payload TEXT, -- XML returned by ZATCA with stamp
    qr_code TEXT, -- TLV Base64 string
    submission_response TEXT, -- Raw ZATCA JSON response
    error_log TEXT,
    retry_count INTEGER DEFAULT 0,
    UNIQUE(company_id, hash)
);
```

---

## 4. API Interface Contracts

### 4.1 ERP Invoice Submission Endpoint
* **Method & Path**: `POST /api/erp/invoices/submit` (and `/api/v2/erp/invoices`)
* **Headers**:
  * `Content-Type: application/json`
  * `x-api-key: sk_sbox_zatcaconnect_uat_v1`
  * `x-signature: <hex_hmac_sha256>`
  * `x-timestamp: 2026-07-02T09:50:00.000Z`
  * `x-nonce: a8f9d2c1e`
* **Request JSON Payload**:
```json
{
  "invoiceNumber": "INV-2026-00101",
  "issueDate": "2026-07-02",
  "invoiceTime": "14:30:00",
  "invoiceType": "388",
  "invoiceSubtype": "Standard",
  "currency": "SAR",
  "totalAmount": 1150.00,
  "taxAmount": 150.00,
  "seller": {
    "name": "Satguru Travels Transport Co.",
    "vatNumber": "300000000000003",
    "address": { "street": "King Fahd Rd", "city": "Riyadh", "postalCode": "12211", "country": "SA" }
  },
  "buyer": {
    "name": "Acme Saudi Logistics",
    "vatNumber": "311111111111113",
    "address": { "street": "Prince Sultan Rd", "city": "Jeddah", "postalCode": "23322", "country": "SA" }
  },
  "items": [
    { "name": "Heavy Equipment Lease", "quantity": 1, "unitPrice": 1000.00, "taxRate": 15, "taxAmount": 150.00, "totalAmount": 1150.00 }
  ]
}
```
* **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "status": "CLEARED",
  "invoiceId": 402,
  "uuid": "8f7a6b5c-4d3e-2f1a-9b8c-7d6e5f4a3b2c",
  "hash": "c2FtcGxlX3NoYTI1Nl9iYXNlNjRfaGFzaA==",
  "qrCode": "AQxFYXN5TGVhc2U...=",
  "zatcaResponse": {
    "validationResults": { "infoMessages": [], "warningMessages": [], "errorMessages": [], "status": "PASS" }
  }
}
```

---

## 5. Non-Functional & System Attributes
1. **Audit Logging**: Every API request must create an immutable record in `audit_logs` storing timestamp, action (`INVOICE_SUBMISSION`), user/company ID, IP address, and request payload hash.
2. **Stable JSON Stringification**: To ensure HMAC signature consistency across different programming languages (Java, C#, Go, Python), all JSON object keys MUST be recursively sorted alphabetically before hashing.
