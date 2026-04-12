# External Integrations - EasyLease-TaxFilling

This project integrates with several external systems and services to facilitate ZATCA compliance and ERP synchronization.

## ZATCA (Fatoora)
- **Service**: ZATCA E-Invoicing API
- **Purpose**: Generation, signing, reporting, and clearing of e-invoices.
- **Environments**: 
    - `SIMULATION`: For testing integration.
    - `SANDBOX`: For development.
    - `PRODUCTION`: For legal compliance.
- **Key Files**: 
    - `server/src/services/zatcaService.ts`
    - `server/src/services/sdkService.ts`
    - `server/src/services/xmlService.ts`

## ERP Systems
- **Mechanism**: Custom HTTP/JSON integration.
- **Inbound**: Periodically fetches invoices from configurable ERP URLs:
    - `fetchAndProcessInvoices` in `server/src/services/integrationService.ts`.
- **Outbound**: Reflects invoice status (cleared/reported/rejected) back to the ERP.
    - `reflectStatusToERP` in `server/src/services/integrationService.ts`.
- **Authentication**: Bearer tokens or Custom API Keys (`x-api-key`).

## Database
- **Provider**: PostgreSQL (likely Neon or Vercel Postgres).
- **ORM**: Prisma Client.
- **Purpose**: Persistent storage for companies, certificates, invoices, and audit logs.

## Cryptography & Security
- **Node Forge / Elliptic**: Used for CSR generation, Private Key management, and XML signing.
- **Security Service**: Handles symmetric encryption for sensitive data stored in the DB (certificates, secrets).
    - `server/src/services/securityService.ts`
