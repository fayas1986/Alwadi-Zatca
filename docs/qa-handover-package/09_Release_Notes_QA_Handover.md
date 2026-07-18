# QA Handover Package & Release Notes
## ZatcaConnect: ZATCA Phase-2 e-Invoicing Compliance Platform

| Release Metadata | Details |
| :--- | :--- |
| **Release Build** | `v1.0.0-RC1` (Release Candidate 1) |
| **Release Date** | July 2, 2026 |
| **Target Audience** | QA Test Engineering Team & Compliance Auditors |
| **Status** | Approved for QA Handover |
| **Author / Generator** | Antigravity (`release-notes` skill) |

---

## 1. Executive Summary & Release Scope

This release package transfers **ZatcaConnect v1.0.0-RC1** from engineering development to the formal Quality Assurance (QA) testing team. This build represents a feature-complete middleware platform designed to integrate enterprise ERP systems with the Saudi Zakat, Tax and Customs Authority (ZATCA) Phase-2 e-Invoicing (Fatoora) core platform.

### Highlights of Release v1.0.0-RC1:
* **Complete ZATCA Phase-2 Support**: Full support for B2B Standard Invoices (Clearance), B2C Simplified Invoices (Reporting), and Credit/Debit notes complying with UBL 2.1 XML specifications.
* **Cryptographic Engine**: Integrated ECDSA `secp256k1` keypair generation, X.509 Certificate Signing Request (CSR) creation, SHA-256 XML hashing, and Type-Length-Value (TLV) Base64 QR code generation.
* **ERP Security Gateway**: Standardized REST API endpoints authenticated via HMAC-SHA256 with timestamp replay protection (<300s window) and nonce deduplication.
* **Three-Stage Environment Routing**: Dynamic API key routing across `SIMULATION` (mock), `SANDBOX` (developer portal), and `PRODUCTION` (ZATCA core) environments.
* **Resilience & DLQ**: Automated Dead Letter Queue (DLQ) with exponential backoff retries for handling ZATCA portal downtime, plus manual admin re-trigger endpoints.
* **RBAC & Audit Governance**: Role-based administrative dashboard (`IT_ADMIN`, `FINANCE_ADMIN`, `TAX_OFFICER`, `SUPER_ADMIN`) backed by an immutable SHA-256 checksummed audit log.

---

## 2. Environment Setup & Deployment Prerequisites

Before executing test suites, the QA team must configure the test environment according to the instructions below:

### Prerequisites:
* **Node.js**: v18.0.0 or higher (`node -v`)
* **PostgreSQL**: v14.0 or higher running locally or on a dedicated QA database server (`psql -V`)
* **Package Manager**: npm v9+ or pnpm

### Installation & Database Initialization Steps:
```bash
# 1. Clone or pull the latest candidate branch
git checkout main
git pull origin main

# 2. Install Node.js dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env and set DATABASE_URL="postgresql://user:pass@localhost:5432/zatca_qa_db"

# 4. Generate Prisma ORM client and push schema to test database
npx prisma generate --schema=prisma/schema.prisma
npx prisma db push --schema=prisma/schema.prisma

# 5. Start backend server and frontend dev server concurrently
npm run dev:all
```

---

## 3. QA Handover Deliverables Inventory

To facilitate comprehensive testing, the engineering team has generated 10 specialized QA artifacts stored in **`docs/qa-handover-package/`** and **`tests/e2e/`**:

| # | Deliverable Name | File Path | Primary Use Case |
| :--- | :--- | :--- | :--- |
| **01** | Product Requirements Document | `docs/qa-handover-package/01_PRD_ZatcaConnect.md` | Understand business goals, user personas, and compliance scope. |
| **02** | Software Requirements Spec | `docs/qa-handover-package/02_SRS_ZatcaConnect.md` | Verify functional rules, data schemas, and API interfaces. |
| **03** | Architecture Review | `docs/qa-handover-package/03_Architecture_Review.md` | Assess system layering, encryption at rest, and DLQ resilience. |
| **04** | Functional Test Cases Matrix | `docs/qa-handover-package/04_Functional_Test_Cases.md` | Execute step-by-step test cases across all 7 platform modules. |
| **05** | QA Execution Checklist | `docs/qa-handover-package/05_QA_Execution_Checklist.md` | Track progress through the 6 mandatory pre-release sign-off gates. |
| **06** | API Test Scenarios | `docs/qa-handover-package/06_API_Test_Scenarios.md` | Execute Postman / cURL REST API tests and HMAC signature validation. |
| **07** | Playwright E2E Patterns | `docs/qa-handover-package/07_E2E_Playwright_Test_Patterns.md` | Understand automated UI testing architecture and network mocking. |
| **08** | Playwright Test Script | `tests/e2e/zatca-flow.spec.ts` | Execute automated E2E test suite (`npx playwright test`). |
| **09** | OWASP Security Review | `docs/qa-handover-package/08_Security_OWASP_Review.md` | Execute penetration testing, SQL injection, and XML bomb audits. |
| **10** | Regression Test Suite | `docs/qa-handover-package/10_Regression_Test_Suite.md` | Maintain automated regression matrix for future release cycles. |

---

## 4. Known Limitations & Workarounds in RC1

1. **Production CSID Onboarding**: Acquiring a live `PRODUCTION` CSID requires an active Saudi tax registration number and a real-time OTP generated from the ZATCA Fatoora portal. **Workaround**: For automated QA regression, use the built-in mock simulator (`SIMULATION` environment) or the ZATCA developer `SANDBOX` environment.
2. **Offline POS Printer Integration**: ZatcaConnect returns the cleared XML and Base64 QR code strings to the calling ERP. Physical thermal printer communication (ESC/POS formatting) is the responsibility of the client's point-of-sale hardware software and is out of scope for middleware QA testing.
3. **High-Concurrency SQLite Limit**: If testing locally using SQLite instead of PostgreSQL, concurrency tests exceeding 50 parallel requests may encounter database lock contention. **Workaround**: Always use PostgreSQL for stress and load testing.

---

## 5. QA Sign-Off Timeline & Support

* **QA Execution Window**: July 2, 2026 – July 10, 2026
* **Target Production Release**: July 15, 2026
* **Engineering Support Contact**: DevOps & Core Architecture Team (`support@Satguru Travelstax.com` / Slack `#zatca-qa-support`)
