# System Architecture - EasyLease-TaxFilling

Overview of the system design, patterns, and data flow.

## High-Level Pattern
The project follows a **Monolithic Repository** structure with a distinct split between the frontend and backend.

- **Frontend**: Single Page Application (SPA) built with React and Vite.
- **Backend**: RESTful API server built with Express and Prisma.

## Frontend Architecture
- **Framework**: React 19.
- **Organization**: Component-driven structure in `/components`.
- **Key Modules**:
    - `Layout.tsx`: Common shell and navigation.
    - `Dashboard.tsx`: Main overview with charts and metrics.
    - `CertificateManager.tsx`: Complex logic for CSR/Certificate handling.
    - `ERPConnectors.tsx`: Configuration for external system sync.
- **Data Flow**: components use `Axios` to fetch data from the backend via a `/api` proxy.

## Backend Architecture
- **Framework**: Express 5.
- **Routing**: Modular route handlers in `server/src/routes`.
- **Services Layer**: Business logic isolated in `server/src/services`.
    - `zatcaService.ts`: Core ZATCA interaction.
    - `integrationService.ts`: ERP synchronization and mapping.
    - `securityService.ts`: Encryption/Decryption.
- **Data Access**: Prisma Client provides a type-safe interface to the PostgreSQL database.
- **Entry Point**: `server/src/index.ts`.

## Data Flow (Invoice Lifecycle)
1. **Fetch**: `integrationService` pulls invoices from external ERPs.
2. **Normalize**: Raw ERP data is mapped to the internal `zatcaInvoice` schema.
3. **Sign**: `sdkService` signs the XML using X.509 certificates and keys.
4. **Report/Clear**: `zatcaService` sends the signed XML to ZATCA.
5. **Persist**: Results and payloads are stored via Prisma.
6. **Reflect**: `integrationService` calls back to the ERP to update the invoice status.

## Deployment
- **Platform**: Vercel (configured via `vercel.json`).
- **Build Pipe**: Prisma generation followed by Vite build.
