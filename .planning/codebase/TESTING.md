# Testing Practices - EasyLease-TaxFilling

Summary of the testing strategies, frameworks, and coverage in the project.

## Overview
The project currently prioritizes **End-to-End (E2E) System Testing** over unit testing. There is a centralized test suite for validating the entire flow from authentication to ZATCA submission.

## Test Suites
### End-to-End System Test
- **Location**: `server/e2e-test.cjs`
- **Type**: Custom Node.js runtime script using `http` and `https` modules.
- **Scope**:
    - **Health**: `GET /health`
    - **Auth**: Login flows for different roles (`SUPER_ADMIN`, `IT_ADMIN`, `FINANCE_ADMIN`).
    - **Item Master**: CRUD operations for items and bulk import.
    - **ERP Integration**: Connector configuration, manual sync, and invoice pull.
    - **Invoice Submission**: B2B (Standard) and B2C (Simplified) submission to ZATCA.
    - **Connectivity**: Real-time ping testing for ZATCA environments (Sandbox, Simulation, Production).
- **Usage**: Run manually using `node server/e2e-test.cjs`.

## Future Testing Targets
- **Unit Testing**: Missing for core utility functions and services.
- **Frontend Testing**: No component testing (e.g., Jest/Vitest or Playwright) is currently implemented.
- **CI/CD Integration**: Tests are currently run manually; they are not yet integrated into a GitHub Action or Vercel build check.

## Test Data
- **Mock ERP**: The E2E script assumes a local or reachable ERP endpoint for testing.
- **Mock ZATCA**: Simulation mode in `zatcaService.ts` allows testing the logic without hitting real ZATCA APIs.
