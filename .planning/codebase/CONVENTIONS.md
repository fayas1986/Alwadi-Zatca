# Coding Conventions - EasyLease-TaxFilling

Summary of the established coding styles, patterns, and standards used in the project.

## Language Standards
- **TypeScript**: Used throughout the project for type safety.
- **ECMAScript Modules (ESM)**: The project uses `"type": "module"`. File imports must include the `.js` extension (e.g., `import { foo } from './bar.js'`).

## Naming Conventions
- **Variables & Functions**: `camelCase`.
- **Classes**: `PascalCase`.
- **React Components**: `PascalCase`.
- **Database Models**: `snake_case` (as defined in `schema.prisma`).
- **Files**:
    - Frontend: `PascalCase.tsx` for components.
    - Backend: `camelCase.ts` for services and routes.

## Backend Patterns
- **API Routes**: Express Router modules in `server/src/routes`.
- **Responses**: Consistent JSON structure:
    - Success: `res.json({ success: true, ...data })`
    - Failure: `res.status(N).json({ success: false, error: 'Message' })`
- **Error Handling**: Comprehensive `try/catch` blocks in every route and service method.
- **Documentation**: Swagger/OpenAPI documentation using JSDoc comments directly above route definitions.

## Database & State
- **Prisma**: All database interactions must go through the Prisma client in `server/src/lib/prisma.ts`.
- **Seed Data**: `prisma/seed.ts` is the source of truth for initial/mock data.

## Security & Privacy
- **Audit Logging**: All sensitive operations (onboarding, reporting, login) must be logged via `AuditService`.
- **Encryption**: Sensitive credentials (private keys, secrets) must be encrypted before storage using `SecurityService.encrypt()`.
- **Data Masking**: Logging of tokens or keys must use the `mask()` helper to prevent PII leakage.
