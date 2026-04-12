# Directory Structure - EasyLease-TaxFilling

Summary of the project's physical organization and key file locations.

## Root Directory
- `/` - Root folder containing Frontend configuration, React entry points, and project-wide tools.
    - `App.tsx` - Main React entry point.
    - `index.html` - HTML template.
    - `vite.config.ts` - Vite build & proxy configuration.
    - `package.json` - Unified dependency manifest.
    - `tsconfig.json` - Shared TypeScript configuration.

## Frontend Modules
- `/components` - React components organized by feature.
    - `CertificateManager.tsx` - CSID & Certificate lifecycle.
    - `Dashboard.tsx` - Main metrics and overview.
    - `ERPConnectors.tsx` - External system configuration.
    - `InvoiceList.tsx` - Data table for processed invoices.
- `/services` - (Potential) Frontend-specific shared logic (needs verification vs backend services).
- `/api` - Frontend API client definitions.

## Backend (Server)
- `/server` - Backend codebase.
    - `/src` - Source code.
        - `index.ts` - Express server entry point.
        - `/routes` - HTTP endpoint definitions.
        - `/services` - Business logic and external integrations.
        - `/lib` - Library initializers (e.g., `prisma.ts`).
        - `/utils` - Shared helper functions.
    - `/zatca-sdk` - Local SDK or utility code for ZATCA logic.

## Data & Infrastructure
- `/prisma` - Prisma ORM configuration and database migrations.
    - `schema.prisma` - Single source of truth for the data model.
    - `seed.ts` - Script for populating the database.
- `/.env` - Environment variables (Local).
- `vercel.json` - Deployment configuration for Vercel.

## Support & Scratch
- `/scratch` - Temporary scripts and debugging tools.
- `/backups` - Backup data or configuration fragments.
- `/logs` - Application runtime logs.
