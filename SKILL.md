    This document defines the technical design, interfaces, and processing logic required to integrate the EGS application with ZATCA (Saudi Tax Authority) Phase-2 e-invoicing platform for:

CSID onboarding

Invoice reporting

Invoice clearance

Cryptographic stamping

QR code compliance

3. References

ZATCA XML Implementation Standard

ZATCA Security Features & Implementation Standard

ZATCA Integration Sandbox Swagger APIs

4. System Architecture
4.1 Logical Components
Component	Responsibility
CSR Service	Generates EC keypair and CSR
Credential Store	Stores CSID, Secret, Private Key (encrypted)
XML Generator	Generates compliant UBL XML
Hash Service	SHA256 + Base64 encoding
ZATCA API Client	Handles Reporting & Clearance
Audit Logger	Logs all ZATCA transactions
5. Environments
Environment	Purpose
Sandbox	Development & testing
Production	Live invoice submission

Each environment shall have:

Separate CSID

Separate Secret

Separate base URL

6. Cryptographic Requirements
Item	Requirement
Algorithm	secp256k1
Hash	SHA-256
Encoding	Base64
Key Storage	Encrypted at rest
Transmission	HTTPS only
7. CSID Onboarding Flow
7.1 CSR Generation

System shall:

Generate EC keypair (secp256k1)

Create CSR containing:

VAT Number

Company Name

Device/Solution ID

Output:

Base64 CSR

Private Key Reference

7.2 Compliance CSID Request

API Call:

POST /csid/compliance


Request Body:

{
  "csr": "BASE64_CSR",
  "otp": "123456"
}


Response:

{
  "complianceCSID": "CSID",
  "requestId": "REQ123"
}


System shall store:

complianceCSID

requestId

7.3 Production CSID Request

API Call:

POST /csid/production


Request Body:

{
  "requestId": "REQ123"
}


Response:

{
  "productionCSID": "CSID",
  "secret": "SECRET"
}


System shall:

Encrypt and store CSID & Secret

Associate with VAT number

8. Invoice Processing
8.1 XML Generation

System shall generate:

Simplified invoice XML (B2C)

Standard invoice XML (B2B)

XML must include:

Seller VAT

Buyer VAT (if B2B)

Line items

VAT totals

Previous invoice hash

8.2 Hash Generation
hash = Base64(SHA256(XML))

8.3 Encoding
encodedXML = Base64(XML)

9. Reporting API (Simplified Invoices)

Endpoint:

POST /invoices/reporting/single


Headers:

Authorization: Basic base64(CSID:SECRET)
Accept-Version: v2


Body:

{
  "invoiceHash": "BASE64_HASH",
  "invoice": "BASE64_XML"
}


Success Response:

{
  "status": "Reported",
  "warnings": null,
  "errors": null
}


System shall:

Update invoice status = REPORTED

Persist response

10. Clearance API (Standard Invoices)

Endpoint:

POST /invoices/clearance/single


Success Response:

{
  "status": "Cleared",
  "clearedInvoice": "BASE64_XML",
  "qrCode": "BASE64_QR"
}


System shall:

Prevent invoice issue before clearance

Store cleared XML

Store QR code

11. Error Handling
11.1 Validation Errors

System shall:

Reject invoice issuance

Display ZATCA error message

Log transaction

11.2 Retry Logic
Condition	Action
Network error	Retry (max 3)
ZATCA 5xx	Retry
ZATCA 4xx	Do not retry
12. Data Model (Simplified)
Invoice Table
Field	Description
id	Invoice ID
xml	Generated XML
hash	SHA256 hash
status	Draft / Reported / Cleared / Failed
zatcaResponse	Raw JSON
qrCode	QR if available
Credential Table
Field	Description
vatNumber	VAT
csid	Encrypted
secret	Encrypted
privateKey	Encrypted
environment	Sandbox/Prod
13. Security Controls
Control	Requirement
Secret Storage	Encrypted
Access	Backend only
Logging	No secrets
TLS	Mandatory
14. Acceptance Criteria

CSID onboarding successful

Invoice reported successfully

Invoice cleared successfully

QR code generated

Errors handled correctly

15. Risks
Risk	Mitigation
XML non-compliance	SDK validation
Wrong hash	Unit tests
API downtime	Retry queue
Credential leak	Encryption
16. Deliverables (Antigravity)

CSR Generator

ZATCA Client

XML Generator

Secure storage

API endpoints

Logging

Postman collection

Test cases