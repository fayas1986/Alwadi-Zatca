# Quality Assurance (QA) & Testing Documentation

This document serves as a comprehensive reference guide for the testing infrastructure established in the **ZATCA Compliance Platform**. It outlines the QA principles, folder structure, available test suites, and instructions on how to run them.

## 1. Testing Philosophy

Our QA strategy follows a **Shift-Left** approach combined with **Test-Driven Development (TDD)** principles. It is structured into two main testing pillars:
1. **Unit & Integration Testing (Backend):** Ensures isolated logic and data integration layers work reliably.
2. **End-to-End (E2E) Testing (Frontend & Full-stack):** Simulates real user flows in automated browser environments.

---

## 2. Testing Frameworks

| Layer | Framework | Description | Config File |
|-------|-----------|-------------|-------------|
| **Unit / Integration** | [Vitest](https://vitest.dev/) | High-speed unit test runner built on Vite. Used for backend services and utilities. | `vite.config.ts` |
| **End-to-End (E2E)** | [Playwright](https://playwright.dev/) | Cross-browser automation framework for testing user interactions. | `playwright.config.ts` |

---

## 3. Directory Structure

The tests are organized into distinct directories based on their purpose:

```text
Alwadi-Zatca/
├── server/src/
│   ├── tests/                  # General Unit and Integration Tests
│   │   ├── api_v1_hmac.test.ts # Security/Auth fallback verification
│   │   ├── companyIdSafety.test.ts
│   │   ├── pagination.test.ts  # Verifies ERP smart pagination logic
│   │   ├── privacy.test.ts     # Verifies PII scrubbing on logs
│   │   └── stringUtils.test.ts # Utility edge-case checks
│   │
│   └── __tests__/              # ZATCA Specific Core Logic Tests
│       ├── zatcaClientFactory.test.ts
│       ├── zatcaMappingService.test.ts
│       └── zatcaUtils.test.ts
│
└── tests/
    └── e2e/                    # Playwright E2E Test Suite
        ├── example.spec.ts     # Core authentication and roles test
        └── pages/
            └── LoginPage.ts    # Page Object Model (POM) for login
```

---

## 4. Running the Tests

### 4.1 Running Unit & Integration Tests (Vitest)
Unit tests ensure that core utilities, compliance mappers, and privacy filters work as intended. 
- **To run all unit tests:**
  ```bash
  npx vitest run
  ```
- **To run in watch mode (for active TDD development):**
  ```bash
  npx vitest
  ```
- **To run a specific test file:**
  ```bash
  npx vitest run server/src/tests/pagination.test.ts
  ```

### 4.2 Running E2E Tests (Playwright)
End-to-End tests verify user interfaces and application flows across Chromium, Firefox, and WebKit browser engines. 
- **To run all E2E tests across all configured browsers:**
  ```bash
  npx playwright test
  ```
- **To view the HTML report of the last test run:**
  ```bash
  npx playwright show-report
  ```
- **To run tests in UI Mode (great for debugging):**
  ```bash
  npx playwright test --ui
  ```

---

## 5. Architectural Patterns Used

### Page Object Model (POM) in E2E
Playwright tests are implemented using the **Page Object Model**. This design pattern encapsulates page-specific logic, selectors, and actions into reusable classes. 
- **Example:** `LoginPage.ts` abstracts the selectors for email, password, and the login button, preventing repetitive hardcoded strings in the test files (`example.spec.ts`).

### Privacy and Security Validations
Several unit tests explicitly enforce non-functional requirements:
- `privacy.test.ts` validates the `PrivacyService` and `AuditService` pipeline, guaranteeing that Personally Identifiable Information (PII), API tokens, and passwords are not written to DB or file logs.
- `api_v1_hmac.test.ts` ensures backwards compatibility fallback logic remains intact for older client integrations.

### API Simulation & Mocking
For testing integration endpoints like ZATCA compliance mappers or ERP integrations (e.g., `pagination.test.ts`), `axios` responses are mocked to simulate external ERP payloads without requiring live endpoints.

---

## 6. Continuous Integration (CI)
The test suites are designed to be run efficiently in continuous integration (CI) environments.
- Ensure `vitest` completely excludes the `tests/e2e/` folder to prevent test runner collisions (this is managed inside `vite.config.ts`).
- When running in a CI pipeline, always use `npx vitest run` rather than watch mode.

## 7. Troubleshooting
1. **Playwright test fails locally:** Make sure the dev server is running before executing tests, as Playwright depends on the local frontend application (usually mapped to `http://localhost:5173`).
2. **Vitest errors with "Cannot read properties of undefined (reading 'create')" in DB calls:** This is normal during unit testing if Prisma isn't mocked explicitly (it will gracefully fall back to a mock file log pattern in `AuditService`).
3. **Vitest process hangs:** Ensure your tests explicitly await asynchronous code and don't contain infinite loops (like in pagination mocking).
