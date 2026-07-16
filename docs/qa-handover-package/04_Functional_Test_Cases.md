# Functional Test Cases Matrix
## ZatcaConnect: ZATCA Phase-2 e-Invoicing Compliance Platform

| Metadata | Details |
| :--- | :--- |
| **Document Version** | 1.0.0-RC1 |
| **Test Matrix Scope** | End-to-End Functional Validation |
| **Status** | Approved for QA Handover |
| **Author / Generator** | Antigravity (`test-case-generator` skill) |

---

## 1. Overview & Execution Strategy

This document provides detailed, step-by-step functional test cases for validating the ZatcaConnect platform. QA engineers must execute these test cases sequentially across the **Simulation** and **Sandbox** environments before attempting any verification against the **Production** environment.

### Legend:
* **P1 (Critical)**: Must pass 100% for release sign-off. Blocker if failed.
* **P2 (High)**: Core functionality. Max 1 workaround permitted.
* **P3 (Medium)**: Edge cases, reporting, or UI formatting.

---

## 2. Module 1: CSID Onboarding & Certificate Lifecycle

| Test ID | Module | Scenario / Objective | Preconditions | Test Steps | Expected Result | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-ONB-001** | Onboarding | Generate CSR & Keypair | Company VAT number is registered in system. | 1. Navigate to Onboarding Dashboard.<br>2. Select company and click "Generate CSR".<br>3. Verify backend response. | System generates a secp256k1 keypair and returns a valid Base64 X.509 CSR. Private key is encrypted in DB. | **P1** | Untested |
| **TC-ONB-002** | Onboarding | Compliance CSID Acquisition | CSR generated; valid OTP from ZATCA Fatoora portal. | 1. Send `POST /api/zatca/onboard` with CSR and 6-digit OTP.<br>2. Verify ZATCA API communication.<br>3. Check certificate table. | ZATCA returns `complianceCSID` and `requestId`. System updates certificate status to `ACTIVE`. | **P1** | Untested |
| **TC-ONB-003** | Onboarding | Invalid OTP Rejection | CSR generated; invalid OTP (e.g., `000000`). | 1. Send `POST /api/zatca/onboard` with invalid OTP.<br>2. Observe response. | System returns HTTP 400 with ZATCA error message ("Invalid OTP"). No CSID is stored. | **P2** | Untested |
| **TC-ONB-004** | Onboarding | Production CSID Acquisition | Compliance testing completed successfully for the request ID. | 1. Trigger Production CSID exchange via API or UI.<br>2. Verify database records. | ZATCA returns `productionCSID` and `secret`. Both are encrypted via AES-256-GCM and stored in DB. | **P1** | Untested |
| **TC-ONB-005** | Onboarding | Certificate Renewal Trigger | Certificate is within 30 days of expiration. | 1. Send `POST /api/zatca/renew` with existing valid CSID.<br>2. Verify new certificate storage. | System successfully acquires a renewed certificate without downtime or manual OTP entry. | **P2** | Untested |

---

## 3. Module 2: B2B Standard Invoices (Clearance Flow)

| Test ID | Module | Scenario / Objective | Preconditions | Test Steps | Expected Result | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-B2B-001** | Invoicing | Successful B2B Clearance | Active Sandbox/Prod CSID; valid B2B invoice payload with Buyer VAT. | 1. Send POST request to `/api/erp/invoices/submit` with `invoiceType: "388"`, `subtype: "Standard"`, and valid Buyer VAT (`311111111111113`).<br>2. Check response. | System returns HTTP 200, `status: "CLEARED"`, ZATCA cryptographic stamp, and cleared XML payload. | **P1** | Untested |
| **TC-B2B-002** | Invoicing | Missing Buyer VAT Rejection | Active CSID; B2B invoice payload missing Buyer VAT number. | 1. Submit B2B invoice without `buyer.vatNumber`.<br>2. Observe error response. | System rejects invoice immediately with HTTP 400 ("Buyer VAT is mandatory for B2B Standard invoices"). | **P1** | Untested |
| **TC-B2B-003** | Invoicing | Invoice Hash Chaining Verification | At least 1 cleared invoice exists in DB for this company. | 1. Submit a new valid B2B invoice.<br>2. Inspect generated XML payload in database.<br>3. Check `<cac:AdditionalDocumentReference>` tag. | The new invoice XML correctly embeds the SHA-256 hash of the immediately preceding invoice in the chain. | **P1** | Untested |
| **TC-B2B-004** | Invoicing | ZATCA Clearance XML Validation Error | Invoice payload contains invalid tax rate calculation (e.g., tax amount != 15% of total). | 1. Submit invoice with intentional math mismatch.<br>2. Check response and DB status. | ZATCA returns 422 Unprocessable Entity. System records invoice as `FAILED`, logs exact ZATCA error messages in `error_log`. | **P1** | Untested |

---

## 4. Module 3: B2C Simplified Invoices (Reporting Flow & QR Code)

| Test ID | Module | Scenario / Objective | Preconditions | Test Steps | Expected Result | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-B2C-001** | Invoicing | B2C Simplified Reporting | Active CSID; valid B2C invoice payload (Buyer VAT optional). | 1. Submit invoice with `subtype: "Simplified"`.<br>2. Verify immediate response.<br>3. Verify background reporting. | System returns HTTP 200 immediately with generated QR code. Status transitions to `REPORTED` after ZATCA API call. | **P1** | Untested |
| **TC-B2C-002** | Invoicing | TLV Base64 QR Code Structure | B2C invoice generated successfully. | 1. Decode the Base64 `qrCode` returned in response using a TLV parser or ZATCA QR scanner app.<br>2. Verify Tags 1 through 9. | All 9 tags (Seller Name, VAT, Timestamp, Total, Tax, Hash, Signature, Public Key, Stamp) are present and correctly structured. | **P1** | Untested |
| **TC-B2C-003** | Invoicing | 24-Hour Offline Buffer | ZATCA Simulation API is temporarily disconnected / unreachable. | 1. Submit B2C invoice while network is disconnected.<br>2. Check invoice status in DB. | Invoice is saved locally with generated QR code. Status is set to `PENDING` or `DLQ` for background retry. | **P1** | Untested |
| **TC-B2C-004** | Invoicing | Zero-Hash Initial Invoice Chaining | No previous invoices exist for a new company registration. | 1. Submit the first B2C invoice for a new company.<br>2. Inspect XML chaining hash. | XML uses ZATCA standard Base64 zero-hash (`NWZlY...=`) for the previous invoice reference. | **P2** | Untested |

---

## 5. Module 4: Credit & Debit Notes

| Test ID | Module | Scenario / Objective | Preconditions | Test Steps | Expected Result | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-CDN-001** | Invoicing | B2B Standard Credit Note | Original B2B invoice exists and was cleared. | 1. Submit credit note (`type: "381"`) referencing original `invoiceNumber`.<br>2. Include billing reference reason code. | System formats UBL 2.1 Credit Note XML, submits to ZATCA clearance, returns `status: "CLEARED"`. | **P1** | Untested |
| **TC-CDN-002** | Invoicing | B2C Simplified Debit Note | Original B2C invoice exists. | 1. Submit debit note (`type: "383"`) with valid reference.<br>2. Verify QR code generation. | System returns `status: "REPORTED"` and generates valid TLV QR code reflecting debit adjustments. | **P2** | Untested |
| **TC-CDN-003** | Invoicing | Missing Original Reference Rejection | Credit note submitted without original invoice reference. | 1. Submit credit note without `billingReference`.<br>2. Observe response. | System rejects request with HTTP 400 ("Billing reference to original invoice is mandatory for Credit/Debit notes"). | **P1** | Untested |

---

## 6. Module 5: ERP Gateway & HMAC Security

| Test ID | Module | Scenario / Objective | Preconditions | Test Steps | Expected Result | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-ERP-001** | Security | Valid HMAC Signature Auth | ERP API key generated (`sk_sbox_...`). Valid payload. | 1. Calculate SHA256 body hash.<br>2. Sign string with HMAC-SHA256.<br>3. Send request with valid headers. | Gateway validates signature and processes request (HTTP 200). | **P1** | Untested |
| **TC-ERP-002** | Security | Tampered Payload Rejection | Valid HMAC headers calculated for Payload A. | 1. Send request with headers calculated for Payload A, but change `totalAmount` in the body (Payload B). | Gateway detects hash mismatch and returns HTTP 401 Unauthorized ("Invalid HMAC Signature"). | **P1** | Untested |
| **TC-ERP-003** | Security | Expired Timestamp Rejection (Replay Defense) | Valid HMAC signature calculated with timestamp from 10 minutes ago. | 1. Send request where `x-timestamp` is older than 300 seconds.<br>2. Observe gateway response. | Gateway rejects request immediately with HTTP 401 Unauthorized ("Request timestamp expired"). | **P1** | Untested |
| **TC-ERP-004** | Security | Duplicate Nonce Rejection | Valid request sent twice within the 5-minute window. | 1. Send valid request (Success).<br>2. Re-send exact same request with same `x-nonce`. | Second request is rejected with HTTP 401 ("Duplicate request nonce detected"). | **P1** | Untested |
| **TC-ERP-005** | Routing | API Key Prefix Routing | Three API keys provisioned: `sk_sim_`, `sk_sbox_`, `sk_live_`. | 1. Send same invoice payload three times using each key respectively.<br>2. Check server routing logs. | `sk_sim_` routes to Simulation, `sk_sbox_` routes to Sandbox, `sk_live_` routes to Production core API. | **P1** | Untested |

---

## 7. Module 6: DLQ, Retry & Error Recovery

| Test ID | Module | Scenario / Objective | Preconditions | Test Steps | Expected Result | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-DLQ-001** | Resilience | Automated Exponential Retry | ZATCA Mock Simulator set to return HTTP 503 Service Unavailable. | 1. Submit invoice.<br>2. Observe status transition to `DLQ` or `PENDING`.<br>3. Monitor worker logs over 5 minutes. | Worker attempts retry at 1 min, 2 min, 4 min intervals (`retry_count` increments in DB). | **P1** | Untested |
| **TC-DLQ-002** | Resilience | Manual DLQ Reprocessing | An invoice is stuck in `DLQ` status after exhausting retries. ZATCA simulator restored to 200 OK. | 1. Send `POST /api/zatca/dlq/reprocess/:invoiceId` via IT/Finance Admin account.<br>2. Check invoice status. | System re-submits XML payload to ZATCA, receives clearance/reporting success, updates status to `CLEARED`/`REPORTED`. | **P1** | Untested |
| **TC-DLQ-003** | Resilience | Permanent Failure Halt | ZATCA returns HTTP 400 Bad Request (syntax error). | 1. Submit malformed XML payload.<br>2. Check if retry worker picks it up. | System sets status to `FAILED`. Worker does NOT attempt automatic retries on 4xx validation errors. | **P2** | Untested |

---

## 8. Module 7: UI Dashboard & Admin Operations

| Test ID | Module | Scenario / Objective | Preconditions | Test Steps | Expected Result | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-ADM-001** | UI / RBAC | Role-Based Access Enforcement | Two user accounts created: `IT_ADMIN` and `TAX_OFFICER`. | 1. Log in as `TAX_OFFICER`. Attempt to delete report templates or modify ERP API keys.<br>2. Verify access denial. | UI hides administrative toggles; API endpoints return HTTP 403 Forbidden for unauthorized role actions. | **P1** | Untested |
| **TC-ADM-002** | UI / Audit | Tamper-Proof Audit Logging | Perform 5 actions (login, submit invoice, generate key, reprocess DLQ). | 1. Navigate to Audit Logs page (`/api/audit`).<br>2. Verify log entries.<br>3. Verify checksum hash. | All 5 actions are recorded with correct timestamps, IP addresses, user roles, and immutable SHA-256 checksums. | **P2** | Untested |
| **TC-ADM-003** | UI / Reports | Data Preview & Template Export | Super Admin logged in; at least 50 invoices in database. | 1. Go to Reports dashboard.<br>2. Select date range and click "Data Preview".<br>3. Export summary PDF/Excel. | UI renders accurate aggregation charts; PDF/Excel export downloads cleanly with correct tax totals. | **P3** | Untested |
