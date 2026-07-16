# QA Execution & Release Sign-Off Checklist
## ZatcaConnect: ZATCA Phase-2 e-Invoicing Compliance Platform

| Metadata | Details |
| :--- | :--- |
| **Document Version** | 1.0.0-RC1 |
| **Checklist Scope** | Pre-Release QA Verification Gates |
| **Status** | Approved for QA Handover |
| **Author / Generator** | Antigravity (`qa-checklist` skill) |

---

## 1. Overview & Sign-Off Governance

This checklist defines the mandatory quality assurance gates required before **ZatcaConnect v1.0.0-RC1** can be certified for production deployment or client handover. QA execution must proceed sequentially through Gates 1 to 6.

### Sign-Off Policy:
* **Gate Blocker Rule**: Any failure in Gate 1, 2, or 3 prevents testing of subsequent gates.
* **100% Pass Rate Required**: All items marked **[P1 - Mandatory]** must pass without open defects.
* **Audit Trail**: The Lead QA Engineer must date and initial each completed check.

---

## 2. Gate 1: Environment Readiness & Smoke Verification

| Check ID | Verification Item | Test Method / Command | Expected Outcome | Status | Initial / Date |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **G1-01** | **Node.js Runtime & Dependencies** | Run `node -v` and `npm ls --depth=0` in workspace root. | Node.js v18+ installed; all dependencies clean without npm errors. | `[ ] Pass`<br>`[ ] Fail` | |
| **G1-02** | **PostgreSQL & Prisma ORM Sync** | Run `npx prisma db pull` and inspect database schema connection. | Database connects successfully; 10 tables present (`companies`, `certificates`, `invoices`, etc.). | `[ ] Pass`<br>`[ ] Fail` | |
| **G1-03** | **Environment Variables Verification** | Inspect `.env` and `.env.local` for required keys (`DATABASE_URL`, `PORT`, `JWT_SECRET`). | All required variables present; no hardcoded production credentials in local files. | `[ ] Pass`<br>`[ ] Fail` | |
| **G1-04** | **Backend Server Startup Smoke** | Execute `npm run dev:server` and check console output. | Server starts on configured port (e.g., 3001) without unhandled promise rejections or TypeScript compiler errors. | `[ ] Pass`<br>`[ ] Fail` | |
| **G1-05** | **Frontend Vite Dev Server Smoke** | Execute `npm run dev` and open dashboard in browser. | Vite dev server binds to port 5173/3000; dashboard UI loads login screen cleanly. | `[ ] Pass`<br>`[ ] Fail` | |
| **G1-06** | **Mock ERP Server Availability** | Send GET request to `http://localhost:3001/api/erp/mock-server`. | Returns HTTP 200 JSON indicating simulator status is `ACTIVE`. | `[ ] Pass`<br>`[ ] Fail` | |

---

## 3. Gate 2: Cryptographic & UBL 2.1 XML Compliance Gate

| Check ID | Verification Item | Test Method / Command | Expected Outcome | Status | Initial / Date |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **G2-01** | **secp256k1 Elliptic Curve Generation** | Trigger CSR generation via Onboarding UI or API (`TC-ONB-001`). | Generated public/private keys conform to 256-bit secp256k1 standard. Private key encrypted in DB. | `[ ] Pass`<br>`[ ] Fail` | |
| **G2-02** | **X.509 CSR Structure Validation** | Decode generated Base64 CSR using OpenSSL (`openssl req -in csr.pem -noout -text`). | Contains mandatory ZATCA fields (`CN`, `C=SA`, `O`, `OU`, 15-digit VAT number in `UID`). | `[ ] Pass`<br>`[ ] Fail` | |
| **G2-03** | **UBL 2.1 XML Namespace Enforcement** | Inspect generated XML payloads in `invoices.xml_payload` database column. | Contains correct namespaces (`urn:oasis:names:specification:ubl:schema:xsd:Invoice-2`, `cac`, `cbc`, `ext`). | `[ ] Pass`<br>`[ ] Fail` | |
| **G2-04** | **XML SHA-256 Digest Calculation** | Manually hash XML payload (`Base64(SHA256(xml))`) and compare against `invoices.hash`. | Calculated digest matches the database `hash` column 100%. | `[ ] Pass`<br>`[ ] Fail` | |
| **G2-05** | **TLV Base64 QR Code Verification** | Decode `qrCode` from B2C invoice using ZATCA verification script or parser (`TC-B2C-002`). | All 9 tags present with exact byte-length encoding and valid cryptographic stamp signature. | `[ ] Pass`<br>`[ ] Fail` | |

---

## 4. Gate 3: ERP Integration & HMAC Security Gate

| Check ID | Verification Item | Test Method / Command | Expected Outcome | Status | Initial / Date |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **G3-01** | **API Key Prefix Routing Engine** | Submit identical invoice payloads using `sk_sim_`, `sk_sbox_`, and `sk_live_` keys (`TC-ERP-005`). | System routes requests to internal simulator, ZATCA sandbox, and ZATCA live endpoints respectively. | `[ ] Pass`<br>`[ ] Fail` | |
| **G3-02** | **HMAC-SHA256 Signature Enforcement** | Send POST request to `/api/erp/invoices/submit` without `x-signature` header. | Gateway immediately rejects request with HTTP 401 Unauthorized. | `[ ] Pass`<br>`[ ] Fail` | |
| **G3-03** | **Timestamp Replay Protection (<300s)** | Send valid signed request with `x-timestamp` set to 10 minutes in the past (`TC-ERP-003`). | Gateway rejects request with HTTP 401 ("Request timestamp expired"). | `[ ] Pass`<br>`[ ] Fail` | |
| **G3-04** | **Nonce Deduplication Engine** | Send two identical requests with same `x-nonce` within 60 seconds (`TC-ERP-004`). | First request returns HTTP 200; second request returns HTTP 401 ("Duplicate request nonce detected"). | `[ ] Pass`<br>`[ ] Fail` | |
| **G3-05** | **Payload Tampering Defense** | Sign body A, but send body B in HTTP payload (`TC-ERP-002`). | Gateway calculates mismatched digest and returns HTTP 401 Unauthorized. | `[ ] Pass`<br>`[ ] Fail` | |

---

## 5. Gate 4: Core Invoicing & Chaining Gate

| Check ID | Verification Item | Test Method / Command | Expected Outcome | Status | Initial / Date |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **G4-01** | **B2B Standard Invoice Clearance** | Submit B2B invoice (`type: "388"`, `subtype: "Standard"`) with Buyer VAT (`TC-B2B-001`). | Returns HTTP 200, `status: "CLEARED"`, ZATCA cryptographic stamp, and cleared XML. | `[ ] Pass`<br>`[ ] Fail` | |
| **G4-02** | **B2C Simplified Invoice Reporting** | Submit B2C invoice (`type: "388"`, `subtype: "Simplified"`) (`TC-B2C-001`). | Returns HTTP 200 immediately with QR code; background worker reports to ZATCA (`status: "REPORTED"`). | `[ ] Pass`<br>`[ ] Fail` | |
| **G4-03** | **Invoice Hash Chaining Integrity** | Submit 3 consecutive invoices for same company; inspect XML references (`TC-B2B-003`). | Invoice #1 uses Zero-Hash; Invoice #2 references Hash #1; Invoice #3 references Hash #2. | `[ ] Pass`<br>`[ ] Fail` | |
| **G4-04** | **Credit Note Original Reference Check** | Submit Credit Note (`type: "381"`) without referencing original invoice (`TC-CDN-003`). | System rejects with HTTP 400 ("Billing reference to original invoice is mandatory"). | `[ ] Pass`<br>`[ ] Fail` | |
| **G4-05** | **ZATCA 422 Validation Handling** | Submit invoice with intentional tax calculation error (`TC-B2B-004`). | Status set to `FAILED`; raw ZATCA validation errors saved in `error_log` database column. | `[ ] Pass`<br>`[ ] Fail` | |

---

## 6. Gate 5: Resilience & DLQ Recovery Gate

| Check ID | Verification Item | Test Method / Command | Expected Outcome | Status | Initial / Date |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **G5-01** | **Network Outage / 5xx Buffer** | Configure mock simulator to return HTTP 503; submit B2C invoice (`TC-DLQ-001`). | Invoice buffered locally with `qrCode`; status set to `DLQ` / `PENDING` without dropping transaction. | `[ ] Pass`<br>`[ ] Fail` | |
| **G5-02** | **Exponential Backoff Retry Schedule** | Monitor worker logs during simulated 503 outage over 5 minutes. | Worker retries at exponential intervals ($1\text{m}, 2\text{m}, 4\text{m}$); increments `retry_count` in DB. | `[ ] Pass`<br>`[ ] Fail` | |
| **G5-03** | **Manual DLQ Reprocessing Endpoint** | Restore simulator to 200 OK; call `POST /api/zatca/dlq/reprocess/:id` (`TC-DLQ-002`). | Stuck invoice re-transmits to ZATCA successfully; status updates from `DLQ` to `REPORTED`. | `[ ] Pass`<br>`[ ] Fail` | |
| **G5-04** | **No-Retry Rule on 4xx Errors** | Verify behavior of invoices that failed with 400/422 validation errors (`TC-DLQ-003`). | Background retry worker skips invoices with `status: "FAILED"`; no infinite retry loops occur. | `[ ] Pass`<br>`[ ] Fail` | |

---

## 7. Gate 6: UI Dashboard & RBAC Security Gate

| Check ID | Verification Item | Test Method / Command | Expected Outcome | Status | Initial / Date |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **G6-01** | **RBAC Role Enforcement in UI** | Log in as `TAX_OFFICER` and attempt to access ERP Configuration or User Management (`TC-ADM-001`). | UI restricts navigation; API requests to admin endpoints return HTTP 403 Forbidden. | `[ ] Pass`<br>`[ ] Fail` | |
| **G6-02** | **Tamper-Proof Audit Logging** | Perform 10 actions; inspect `/api/audit` endpoint and `audit_logs` table (`TC-ADM-002`). | All 10 actions logged with timestamp, user ID, IP address, and SHA-256 payload hash checksums. | `[ ] Pass`<br>`[ ] Fail` | |
| **G6-03** | **Dashboard KPI & Chart Accuracy** | Verify Dashboard KPI cards (Total Invoices, Cleared, Reported, Failed, DLQ count). | Numbers match exact SQL count queries against `invoices` table in database. | `[ ] Pass`<br>`[ ] Fail` | |

---

## 8. Release Sign-Off Approval Block

Upon successful execution of all verification gates above, the undersigned certify that **ZatcaConnect v1.0.0-RC1** meets all architectural, functional, and security requirements for production release.

| Role | Name / Signature | Date | Decision |
| :--- | :--- | :--- | :--- |
| **Lead QA Engineer** | | | `[ ] Approved` / `[ ] Rejected` |
| **Lead DevOps / Systems Architect** | | | `[ ] Approved` / `[ ] Rejected` |
| **ZATCA Compliance Officer** | | | `[ ] Approved` / `[ ] Rejected` |
