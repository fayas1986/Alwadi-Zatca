# ZATCA Onboarding & Operation Guide
## EasyLease ZatcaConnect — Per-Customer Deployment Manual

This guide describes how to onboard, configure, and maintain customer units on the **ZATCA Fatoora (Phase 2)** integration platform. Follow these steps once per customer for **Simulation** (testing) and **Production** (live filing).

---

## 📋 Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Step 1: Customer Data Collection](#2-step-1-customer-data-collection)
3. [Step 2: Database Pre-configuration](#3-step-2-database-pre-configuration)
4. [Step 3: Onboarding to Simulation (Testing)](#4-step-3-onboarding-to-simulation)
5. [Step 4: Onboarding to Production (Go-Live)](#5-step-4-onboarding-to-production)
6. [Step 5: Dynamic Certificate Renewal](#6-step-5-dynamic-certificate-renewal)
7. [🔍 Troubleshooting & Common Errors](#-troubleshooting--common-errors)
8. [⚙️ Environment Variables Reference](#-environment-variables-reference)

---

## 1. Prerequisites

Before starting the onboarding sequence, verify that the environment meets the following conditions:

* **Java Runtime**: JDK 17+ installed. Verify with `java -version`.
* **ZATCA SDK**: The official SDK jar must be located at `server/zatca-sdk/zatca-sdk.jar`.
* **Database**: Clean database schema initialized via Prisma (`npx prisma db push`).
* **Environment variables**: Correctly configured `.env` file (see [Environment Variables Reference](#-environment-variables-reference)).
* **Corporate Credentials**: Access credentials to the ZATCA Fatoora Portal (https://fatoora.zatca.gov.sa).

---

## 2. Step 1: Customer Data Collection

Collect the following corporate details from the customer. These fields are injected into the cryptographic CSR (Certificate Signing Request) and must match ZATCA's official commercial record:

| Field name | Description / Format | Example |
| :--- | :--- | :--- |
| **Registered Name** | Official English/Arabic business name | `Easy Lease Transport Services LLC` |
| **VAT Number** | 15-digit Tax Identification Number | `311499218600003` |
| **TIN** | First 10 digits of the VAT number | `3114992186` |
| **Industry Code** | Standard business category classification | `Transport` |
| **Address Details** | Street, Bldg Number, District, City, Country, Zip | `King Fahd Road, Building 1234, Al Olaya, Riyadh, SA, 12214` |
| **Invoice Subtype** | Standard (`1000`), Simplified (`0100`), or Both (`1100`) | `1100` |

---

## 3. Step 2: Database Pre-configuration

Set up or update the company record inside the Postgres database. You can do this by running an SQL statement or using the backend admin panel:

```sql
-- Create or update company record prior to onboarding
INSERT INTO companies (
    id, registered_name, vat_number, branch_name, 
    city, street_name, building_number, city_subdivision, 
    postal_zone, environment, is_active
) VALUES (
    'company-unique-uuid',
    'Easy Lease Transport Services (Sole Proprietorship) L.L.C.',
    '311499218600003',
    'HQ-Riyadh',
    'Riyadh',
    'King Fahd Road',
    '1234',
    'Al Olaya',
    '12214',
    'PRODUCTION', -- Set to SIMULATION first, update to PRODUCTION when ready
    true
)
ON CONFLICT (vat_number) DO UPDATE SET
    registered_name = EXCLUDED.registered_name,
    environment = EXCLUDED.environment,
    is_active = true;
```

---

## 4. Step 3: Onboarding to Simulation (Testing)

Always complete the Simulation cycle to verify invoice generation and communication before onboarding to Production.

### 3.1 Generate a Simulation OTP
1. Log in to the **ZATCA Fatoora Simulation Portal** (Fatoora Portal → Developer/Simulation section).
2. Go to **Solutions → Onboarding → EGS Units**.
3. Click **Generate OTP**. Copy the 6-digit code.

### 3.2 Execute Onboarding Script
Run the simulation onboarding command:
```powershell
$env:OTP="<SIMULATION_OTP_HERE>"; npx tsx scripts/onboard_real_simulation.ts
```

### 3.3 Verify Submission
Send a test invoice through to ensure that signing, cryptographic hashing, and compliance clearance succeed:
```powershell
npx tsx scripts/verify_real_zatca_sequence.ts
```
Login to the ZATCA portal to verify that the compliance EGS unit has registered and that sample invoices are displayed correctly.

---

## 5. Step 4: Onboarding to Production (Go-Live)

Once the simulation tests are complete, you can onboard the production system.

### 4.1 Generate a Production OTP
1. Log in to the **ZATCA Fatoora Production Portal** (https://fatoora.zatca.gov.sa).
2. Go to **Solutions → Onboarding → EGS Units**.
3. Click **Generate OTP**. Copy the 6-digit code.

### 4.2 Execute Production Onboarding Script
Run the production onboarding command:
```powershell
$env:OTP="<PRODUCTION_OTP_HERE>"; npx tsx scripts/onboard_real_production.ts
```

> [!WARNING]
> Production onboarding links the EGS unit to live tax reporting. Every invoice submitted after this point is legally binding and submitted directly to the government database.

---

## 6. Step 5: Dynamic Certificate Renewal

ZATCA certificates expire after a set period. You can renew the certificate directly through the dashboard UI or programmatically using the API.

### 6.1 UI Renewal
1. Navigate to the **Certificate Manager** page on the dashboard.
2. Locate the active certificate and click the **Renew** button.
3. Enter a fresh 6-digit OTP obtained from the ZATCA portal (EGS Units panel).
4. Click **Renew Certificate**. The application will automatically obtain the new CSID from ZATCA, update the database record, and hot-reload.

### 6.2 API Renewal
Submit a POST request to the backend:
```http
POST /api/zatca/renew
Content-Type: application/json

{
  "vat": "311499218600003",
  "otp": "<NEW_OTP_CODE>",
  "environment": "production" // 'production' or 'simulation'
}
```

---

## 🔍 Troubleshooting & Common Errors

### ❌ `publicKey_QRCODE_INVALID`
* **Cause**: Mismatch between the public key embedded in the generated QR Code and the cryptographic public key of the certificate used for authorization.
* **Fix**: Ensure that the certificate file (`cert.pem`) passed to the Java SDK is normalized to a single-line base64 representation of raw DER bytes. Avoid double base64-encoding or prepending PEM headers.

### ❌ `Invalid OTP`
* **Cause**: The OTP has expired (validity is 1 hour), has already been consumed, or was generated on the wrong portal environment (e.g., trying to use a simulation OTP on the production client).
* **Fix**: Generate a fresh OTP on the correct portal environment.

### ❌ `Curve not supported: secp256k1`
* **Cause**: ZATCA requires ECDSA keys on the `secp256k1` curve. Java JDK environment might fail to decode if key format is wrapped in PKCS#8.
* **Fix**: Ensure the private key is converted into SEC1 format before being written to disk for Java SDK usage. The application's `sdkService.ts` handles this translation automatically.

---

## ⚙️ Environment Variables Reference

Make sure these settings are defined inside the `.env` configuration file:

```env
# Database
DATABASE_URL="postgresql://neondb_owner:..."

# ZATCA Java SDK Configurations
ZATCA_SDK_PATH="C:\path\to\server\zatca-sdk\zatca-sdk.jar"
JAVA_EXE_PATH="C:\Program Files\Java\jdk-17\bin\java.exe"

# Security (used to encrypt keys at rest in database)
ENCRYPTION_KEY="32-character-secret-encryption-key"

# App Settings
USE_MOCK_SDK="false"
```
