# Alwadi-Zatca — Backup, Disaster Recovery & Customer Migration Runbook

## 1. Overview & Data Retention Policy

This runbook defines operational procedures for daily backup, point-in-time recovery (PITR), disaster recovery, and customer database provisioning for Alwadi-Zatca.

### Data Residency & Security Constraints
- **Location:** All backups, database instances, and snapshots MUST remain within approved Kingdom of Saudi Arabia boundaries:
  - **AWS:** Region `me-south-2` (Dammam, Saudi Arabia).
  - **Azure:** Region `saudiarabiaeast` (Riyadh/Dammam, Saudi Arabia).
- **Encryption:** Encryption at rest is MANDATORY for all automated backups and manual snapshots using AWS KMS or Azure Key Vault managed keys (`AES-256`).
- **Target Metrics:**
  - **RTO (Recovery Time Objective):** < 30 minutes.
  - **RPO (Recovery Point Objective):** < 5 minutes (via WAL archiving & automated continuous logging).

---

## 2. Automated Backup Strategy

### AWS RDS PostgreSQL (`me-south-2`)
- **Automated Backup Window:** Daily at 02:00 UTC (05:00 KSA local time).
- **Retention Period:** 30 days (Continuous WAL archiving enabled for PITR).
- **Cross-Region Snapshot Copy:** Disabled (ensures zero data leaves KSA borders).

### Azure Database for PostgreSQL Flexible Server (`saudiarabiaeast`)
- **Backup Type:** Automated daily full backups + log backups every 5 minutes.
- **Retention Period:** 30 days (Point-In-Time Restore enabled).
- **Geo-Redundancy:** Disabled or set to same-region local redundancy (`Local`).

---

## 3. Database Restoration & Recovery Procedure

### Scenario A: Point-in-Time Restore (Accidental Data Issue)

1. **Identify Target Recovery Timestamp:** Determine exact timestamp (UTC/KSA) prior to issue.
2. **Provision Restored Database Instance:**
   ```bash
   # AWS CLI Example (AWS KSA me-south-2)
   aws rds restore-db-instance-to-point-in-time \
     --region me-south-2 \
     --source-db-instance-identifier rds-alwadi-prod \
     --target-db-instance-identifier rds-alwadi-restored \
     --restore-time 2026-10-09T18:00:00.000Z \
     --db-subnet-group-name dbsubnet-alwadi \
     --no-publicly-accessible
   ```
3. **Verify Database Connection & Identity:**
   Update temporary test `.env` with connection string of restored database and execute:
   ```bash
   npx tsx scripts/migrate_customer_db.ts config/alwadi-production-spec.json
   ```
4. **Execute Post-Restore Smoke Test:**
   ```bash
   npx tsx scripts/inspect_active_db_metadata.ts
   ```
5. **Switch Container Connection String:**
   Update AWS Secrets Manager / Azure Key Vault secret `DATABASE_URL` to point to the restored DB endpoint and trigger zero-downtime rolling restart.

---

## 4. Provisioning New Enterprise Customers

To prevent cross-customer data leakage:
- **Rule 1:** NEVER clone an existing customer's production database to create a new customer environment.
- **Rule 2:** Every new customer MUST be provisioned with an empty, dedicated PostgreSQL database instance.

### Provisioning Steps:
1. Validate Customer Specification JSON against Schema & Saudi Data Residency:
   ```bash
   npx tsx scripts/verify_saudi_region.ts config/new-customer-spec.json
   ```
2. Provision Cloud Infrastructure via Terraform:
   ```bash
   cd infrastructure/terraform
   terraform apply -var-file="new-customer.tfvars"
   ```
3. Apply Idempotent Database Schema & Initial Data:
   ```bash
   DATABASE_URL="postgresql://customer_user:pass@host:5432/customer_db?sslmode=require" \
   npx tsx scripts/migrate_customer_db.ts config/new-customer-spec.json
   ```
4. Seed Customer Baseline Configuration:
   Run customer-isolated seed script populating only customer legal company entity and administrator account.
