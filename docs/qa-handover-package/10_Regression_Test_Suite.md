# Master Regression Test Suite & Governance Matrix
## ZatcaConnect: ZATCA Phase-2 e-Invoicing Compliance Platform

| Metadata | Details |
| :--- | :--- |
| **Document Version** | 1.0.0-RC1 |
| **Execution Frequency**| Every PR Merge, Nightly CI/CD, and RC Sign-Off |
| **Status** | Approved for QA Handover |
| **Author / Generator** | Antigravity (`regression-testing` skill) |

---

## 1. Executive Summary & Regression Strategy

To ensure continuous compliance with ZATCA Phase-2 e-Invoicing (Fatoora) regulations across iterative application updates, **ZatcaConnect** establishes a risk-tiered regression testing methodology. Any modification to backend cryptographic signing, XML serialization, or database schema models can inadvertently break compliance, leading to rejection by ZATCA's core API.

### Objectives:
* **Automate Core Compliance**: Maintain 100% automated test coverage for Tier 1 (Cryptography & XML) and Tier 2 (ERP Security) workflows inside CI/CD pipelines.
* **Prevent Regression Drift**: Ensure new features (such as custom reporting or ERP connector additions) do not degrade existing clearance SLA response times (< 2 seconds).
* **Regulatory Future-Proofing**: Establish a standardized test baseline that can be rapidly executed against updated ZATCA sandbox specifications whenever tax law mandates change.

---

## 2. Risk-Tiered Categorization

```mermaid
pie title Regression Suite Execution Breakdown by Risk Tier
    "Tier 1: Cryptography & XML (Auto)" : 40
    "Tier 2: ERP HMAC Security (Auto)" : 30
    "Tier 3: DLQ & Resilience (Hybrid)" : 20
    "Tier 4: UI & RBAC (Manual/E2E)" : 10
```

| Risk Tier | Category Scope | Execution Mode | Mandatory Pass Threshold |
| :--- | :--- | :--- | :--- |
| **Tier 1 (Critical)** | CSID Onboarding, secp256k1 key generation, UBL 2.1 XML structure, SHA-256 digests, QR Code TLV tags. | 100% Automated (CI/CD Blocker) | **100% Pass** (Zero Tolerance) |
| **Tier 2 (High)** | ERP HMAC-SHA256 authentication, timestamp replay defense, nonce deduplication, dynamic environment routing. | 100% Automated (CI/CD Blocker) | **100% Pass** (Zero Tolerance) |
| **Tier 3 (High)** | Dead Letter Queue (DLQ) automatic retry scheduling, exponential backoff, manual admin reprocess endpoint. | Hybrid (Automated API + Manual UI) | **100% Pass** |
| **Tier 4 (Medium)** | UI Dashboard KPI counters, role-based access control (RBAC), audit log checksums, PDF/Excel report exports. | Automated Playwright E2E + Manual | $\ge 95\%$ Pass (No P1 defects) |

---

## 3. Master Regression Test Matrix

### 3.1 Tier 1: Core Cryptographic & XML Compliance Suite
| Reg ID | Functional Reference | Test Scenario Description | Execution Method | Automated Tool / Script |
| :--- | :--- | :--- | :--- | :--- |
| **REG-T1-01** | `TC-ONB-001`, `G2-01` | Validate secp256k1 keypair generation and X.509 CSR Base64 formatting. | Automated | `npx tsx verify_zatca_compliance.ts` |
| **REG-T1-02** | `TC-B2B-001`, `G2-03` | Verify UBL 2.1 Standard Invoice XML structure and mandatory ZATCA namespaces. | Automated | `npx tsx verify_v1_api.ts` |
| **REG-T1-03** | `TC-B2B-003`, `G4-03` | Verify sequential invoice SHA-256 hash chaining (`<cac:AdditionalDocumentReference>`). | Automated | Playwright API Spec (`tests/e2e/zatca-flow.spec.ts`) |
| **REG-T1-04** | `TC-B2C-002`, `G2-05` | Verify TLV Base64 QR code generation containing exact byte-encoded Tags 1 through 9. | Automated | Unit Test / Playwright API Spec |
| **REG-T1-05** | `TC-CDN-001`, `G4-04` | Verify Credit/Debit Note XML formatting and mandatory billing reference validation. | Automated | Playwright API Spec |

### 3.2 Tier 2: ERP Gateway & Security Suite
| Reg ID | Functional Reference | Test Scenario Description | Execution Method | Automated Tool / Script |
| :--- | :--- | :--- | :--- | :--- |
| **REG-T2-01** | `TC-ERP-001`, `API-003` | Verify valid HMAC-SHA256 calculation using `stableStringify` and API secret key. | Automated | `npx tsx tests/e2e-integration-test.ts` |
| **REG-T2-02** | `TC-ERP-002`, `API-005` | Verify HTTP 401 Unauthorized rejection when payload body is modified after signing. | Automated | Playwright API Spec |
| **REG-T2-03** | `TC-ERP-003`, `API-006` | Verify HTTP 401 rejection for replayed requests with `x-timestamp` > 300 seconds old. | Automated | Playwright API Spec |
| **REG-T2-04** | `TC-ERP-004`, `API-007` | Verify HTTP 401 rejection for duplicate `x-nonce` submissions within 5 minutes. | Automated | Playwright API Spec |
| **REG-T2-05** | `TC-ERP-005`, `G3-01` | Verify dynamic environment routing based on API key prefix (`sk_sim_`, `sk_sbox_`, `sk_live_`). | Automated | `npx tsx tests/e2e-integration-test.ts` |

### 3.3 Tier 3: DLQ Resilience & Recovery Suite
| Reg ID | Functional Reference | Test Scenario Description | Execution Method | Automated Tool / Script |
| :--- | :--- | :--- | :--- | :--- |
| **REG-T3-01** | `TC-DLQ-001`, `G5-01` | Verify invoice transitions to `DLQ` when ZATCA API returns HTTP 503 Service Unavailable. | Automated | Playwright API Spec / Mock Server |
| **REG-T3-02** | `TC-DLQ-002`, `API-010` | Verify admin can manually trigger DLQ reprocessing via `POST /api/zatca/dlq/reprocess/:id`. | Automated | Playwright API Spec |
| **REG-T3-03** | `TC-DLQ-003`, `G5-04` | Verify worker halts retry loop on permanent HTTP 400/422 ZATCA schema validation errors. | Automated | Playwright API Spec |

### 3.4 Tier 4: Multi-Tenant RBAC & UI Dashboard Suite
| Reg ID | Functional Reference | Test Scenario Description | Execution Method | Automated Tool / Script |
| :--- | :--- | :--- | :--- | :--- |
| **REG-T4-01** | `TC-ADM-001`, `G6-01` | Verify `TAX_OFFICER` and `FINANCE_ADMIN` roles are denied access to IT admin configurations. | Automated E2E | Playwright UI Spec (`tests/e2e/zatca-flow.spec.ts`) |
| **REG-T4-02** | `TC-ADM-002`, `G6-02` | Verify immutable audit log generation in `audit_logs` table with SHA-256 checksums. | Automated / Manual| Playwright UI Spec / SQL Inspection |
| **REG-T4-03** | `TC-ADM-003`, `G6-03` | Verify Dashboard KPI card counters match database invoice status counts accurately. | Automated E2E | Playwright UI Spec (`tests/e2e/zatca-flow.spec.ts`) |

---

## 4. CI/CD Automated Pipeline Configuration

To enforce continuous regression testing, integrate the following GitHub Actions pipeline (`.github/workflows/regression.yml`) into the repository:

```yaml
name: ZatcaConnect Master Regression Suite

on:
  push:
    branches: [ main, staging ]
  pull_request:
    branches: [ main ]
  schedule:
    - cron: '0 2 * * *' # Nightly at 02:00 UTC

jobs:
  regression-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: password123
          POSTGRES_DB: zatca_qa_db
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Checkout Codebase
        uses: actions/checkout@v4

      - name: Setup Node.js v18
        uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'npm'

      - name: Install Dependencies & Playwright Browsers
        run: |
          npm ci
          npx playwright install --with-deps chromium

      - name: Initialize Test Database & ORM
        env:
          DATABASE_URL: "postgresql://postgres:password123@localhost:5432/zatca_qa_db"
        run: |
          npx prisma generate --schema=prisma/schema.prisma
          npx prisma db push --schema=prisma/schema.prisma

      - name: Execute Tier 1 & Tier 2 API Regression Scripts
        env:
          DATABASE_URL: "postgresql://postgres:password123@localhost:5432/zatca_qa_db"
        run: |
          npm run dev:server &
          npx wait-on http://localhost:3001/api/erp/mock-server
          npx tsx verify_zatca_compliance.ts
          npx tsx tests/e2e-integration-test.ts

      - name: Execute Tier 3 & Tier 4 Playwright E2E Regression Suite
        env:
          DATABASE_URL: "postgresql://postgres:password123@localhost:5432/zatca_qa_db"
        run: |
          npm run dev:all &
          npx wait-on http://localhost:5173
          npx playwright test tests/e2e/ --project=chromium

      - name: Upload Playwright Regression Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-regression-report
          path: playwright-report/
          retention-days: 14
```

---

## 5. Defect Governance & Maintenance Policy

1. **Regression Failure Blocker**: Any test failure in Tier 1 or Tier 2 automatically blocks pull request merging and release candidate promotion.
2. **Test Script Maintenance**: When ZATCA releases an updated XML validation schema or new SDK version, QA must update `verify_zatca_compliance.ts` and `mock-invoices.json` within 5 business days.
3. **Flaky Test Resolution**: If a Playwright E2E UI test exhibits >5% flakiness over 20 consecutive CI runs, it must be moved to a quarantine suite and refactored using explicit web assertions within 48 hours.
