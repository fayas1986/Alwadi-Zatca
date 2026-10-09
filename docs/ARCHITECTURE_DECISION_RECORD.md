# Architecture Decision Record (ADR-001)

## Title: Customer Database Isolation, Docker Packaging & Cloud Portability Model

**Status:** Approved  
**Date:** 2026-10-09  
**Authors:** Senior Software Architect / Engineering Team  
**Target Application:** Alwadi-Zatca Middleware  

---

## 1. Context and Problem Statement
Alwadi-Zatca is a ZATCA Phase-2 B2B/B2C Electronic Invoicing middleware integrating with ERP solutions (Dynamics 365 F&O, SAP, custom REST APIs) and submitting signed UBL 2.1 XML invoices to Saudi Arabia's ZATCA Fatoora Portal.

To serve multiple enterprise customers safely, the application must guarantee zero cross-customer data leakage, support deployment to cloud providers in Saudi Arabia (AWS `me-central-1` / `me-south-1` or Azure `saudiarabiaeast`), allow independent scaling, provide containerized execution, and enforce automated release gates.

---

## 2. Decision Outcomes

### Decision 1: Customer Isolation Model (Dedicated DB per Customer)
* **Approach:** Each enterprise customer operates in a dedicated deployment boundary with its own PostgreSQL database instance (or isolated schema/database on managed cloud PostgreSQL).
* **Rationale:** Completely eliminates cross-tenant data corruption risk at the infrastructure level. Eliminates multi-tenant query bugs and shared database blast radius.
* **Server-side Security:** Server-side authorization middleware continues to enforce `company_id` scoping inside each customer's database as a second line of defense.

### Decision 2: Hybrid Runtime Container Architecture (Node.js + OpenJDK 17)
* **Approach:** Standardize container runtime image on Alpine Linux featuring Node.js 20 runtime alongside OpenJDK 17 JRE.
* **Rationale:** ZATCA XML canonicalization and ECDSA signing depend on the official ZATCA SDK Java JAR (`zatca-sdk.jar`). Packaging OpenJDK 17 inside the Node image enables seamless local Java sub-process execution without relying on external remote signing services.

### Decision 3: Process Separation (API Server vs. Background Worker)
* **API Entrypoint (`server/src/index.ts`):** Handles HTTP API routes, OAuth/JWT verification, ERP webhook ingest, and status lookups.
* **Worker Entrypoint (`server/src/worker.ts`):** Executes asynchronous background queue processing (retries, ZATCA status polling, ERP background polling) isolated from HTTP server threads.

### Decision 4: Idempotent Migration Pipeline
* **Migration Strategy:** Database schema migrations use `prisma migrate deploy` with PostgreSQL advisory locks (`pg_advisory_lock`).
* **Validation:** Migration runner verifies customer database identity, applies pending migrations, performs schema health checks, and executes automated smoke tests before routing live traffic.

### Decision 5: Data Residency & Cloud Portability (AWS / Azure Saudi Arabia)
* **KSA Compliance:** Mandatory regional validation (`scripts/verify_saudi_region.ts`) enforces allowed Saudi Arabia cloud regions (AWS `me-central-1` / Azure `saudiarabiaeast`). Deployments to unauthorized regions are hard-rejected during infrastructure provisioning.
* **Infrastructure as Code:** Provider-neutral Terraform interfaces manage AWS (App Runner/ECS + RDS PostgreSQL) and Azure (Container Apps + Flexible Server PostgreSQL).

---

## 3. Environment & Configuration Matrix

| Variable | Description | Security Requirement |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | Secret Manager |
| `JWT_SECRET` | JWT signing secret | Secret Manager |
| `ZATCA_ENV` | `SIMULATION` / `SANDBOX` / `PRODUCTION` | Environment Config |
| `COMPANY_REGISTERED_NAME` | Customer legal company name | Environment Config |
| `ZATCA_SDK_PATH` | Path to `zatca-sdk.jar` | Immutable Image Path |
| `JAVA_EXE_PATH` | Path to Java runtime (`java`) | System Path (`/usr/bin/java`) |

---

## 4. Consequences & Operational Guidelines
- **Positive:** Maximum security isolation, zero shared database contamination risk, 100% compliance with Saudi Arabia data residency laws, deterministic CI/CD release gate validation.
- **Trade-off:** Operating individual databases requires automated database migration management (`scripts/migrate_customer_db.ts`).
