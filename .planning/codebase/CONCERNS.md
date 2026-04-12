# Technical Concerns & Debt - EasyLease-TaxFilling

Catalogue of known technical debt, architectural concerns, and areas for improvement.

## Technical Debt

### Bloated Route Handlers
- **File**: `server/src/routes/zatca.ts` (~1100+ lines)
- **Issue**: This file is excessively large and violates the Single Responsibility Principle. It contains:
    - Inline utility functions for JSON/XML manipulation.
    - Complex session management logic.
    - Large route handlers with deeply nested logic.
    - Cryptographic operations and logging helpers.
- **Recommendation**: Extract business logic into dedicated services (`ZatcaService`, `ComplianceService`) and modularize routes.

### Complex Environment Logic
- **Issue**: The codebase contains many conditional checks for `SANDBOX`, `SIMULATION`, and `PRODUCTION`, often with hardcoded bypasses for the `Simulation` mode.
- **Risk**: Maintaining consistency across environments is difficult and error-prone.
- **Recommendation**: Implement an environment abstraction layer to handle these differences cleanly without polluting core business logic.

### Testing Coverage
- **Issue**: The project lacks unit and integration tests. The `server/e2e-test.cjs` tool is powerful but manual and hard to maintain as the app grows.
- **Risk**: Regressions in core compliance logic (ZATCA signature generation, XML mapping) could go unnoticed.
- **Recommendation**: Introduce `Vitest` or `Jest` for unit testing logic-heavy services.

### API Response Uniformity
- **Issue**: While `CONVENTIONS.md` mandates a `{ success, data, error }` structure, some legacy or internal helper functions may still return inconsistent shapes.
- **Recommendation**: Audit and wrap all responses in a standard `ResponseHandler`.

## Performance & Scalability

### Database Connection Management
- **Issue**: Using Prisma in a serverless-like environment (Vercel) can lead to connection exhaustion if not managed correctly.
- **Recommendation**: Ensure the connection pool is optimized and `prisma.$disconnect()` is handled where appropriate, or use a Proxy.

### Large JSON Payload Handling
- **Issue**: Fetching thousands of invoices from the ERP in a single request could cause memory spikes or timeouts.
- **Recommendation**: Implement pagination or streaming for ERP data ingestion.

## Security Observations

### Secret Management
- **Issue**: All secrets are stored in `.env`. While encrypted in production via `SecurityService`, the master key itself must be securely rotated and managed.
- **Recommendation**: Use a cloud secret manager (AWS Secrets Manager, Vercel Secrets) for sensitive keys in production.

### PII in Logs
- **Issue**: Despite masking, extremely sensitive data (like private keys or onboarding OTPs) must be handled with extreme care in the `audit_log` table.
- **Recommendation**: Continuous auditing of loggers to ensure no raw secrets are persisted.
