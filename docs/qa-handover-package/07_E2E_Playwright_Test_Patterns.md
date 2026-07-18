# Playwright E2E Testing Architecture & Best Practices
## ZatcaConnect: ZATCA Phase-2 e-Invoicing Compliance Platform

| Metadata | Details |
| :--- | :--- |
| **Document Version** | 1.0.0-RC1 |
| **Automation Framework**| Playwright (TypeScript) |
| **Status** | Approved for QA Handover |
| **Author / Generator** | Antigravity (`e2e-testing-patterns` skill) |

---

## 1. Executive Summary & Automation Strategy

End-to-End (E2E) testing for **ZatcaConnect** requires verifying both administrative UI interactions and underlying cryptographic background API processing. This document establishes proven architectural patterns using **Playwright with TypeScript** to ensure reliable, flake-free automated testing across React frontend dashboards and Express/Prisma backend workflows.

### E2E Architecture Objectives:
* **Zero Flakiness**: Avoid hardcoded `page.waitForTimeout()` calls by utilizing Playwright's auto-waiting locators and web assertions.
* **Page Object Model (POM)**: Encapsulate UI selectors and page behaviors into reusable class modules.
* **Network Mocking & Isolation**: Use `page.route()` to intercept external ZATCA API calls when testing frontend resilience against simulated ZATCA portal downtime (503 Service Unavailable).
* **Authentication State Persistence**: Save login JWT tokens and browser storage state across test specs to eliminate repetitive login UI interactions.

---

## 2. Playwright Directory & Project Structure

The automated test suite is structured inside the repository as follows:

```
tests/
  ├── e2e/
  │    ├── fixtures/
  │    │    ├── auth.fixture.ts        # Custom Playwright auth fixture
  │    │    └── mock-invoices.json     # Sample ZATCA XML & JSON responses
  │    ├── pages/
  │    │    ├── LoginPage.ts           # POM for /login
  │    │    ├── DashboardPage.ts       # POM for root dashboard KPIs
  │    │    └── OnboardingPage.ts      # POM for CSR / CSID onboarding
  │    └── zatca-flow.spec.ts          # Executable E2E test suite
  └── e2e-integration-test.ts          # Backend HMAC API isolation test
```

---

## 3. Page Object Model (POM) Design Patterns

To maintain clean test code, selectors are centralized inside Page Objects. Below is the pattern used for the ZatcaConnect UI:

### 3.1 `LoginPage.ts` Pattern
```typescript
import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input[type="email"]');
    this.passwordInput = page.locator('input[type="password"]');
    this.loginButton = page.locator('button[type="submit"]');
    this.errorMessage = page.locator('.error-banner, [role="alert"]');
  }

  async goto() {
    await this.page.goto('http://localhost:5173/login');
  }

  async login(email: string, pass: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(pass);
    await this.loginButton.click();
  }
}
```

---

## 4. Authentication State Persistence (`storageState`)

Instead of executing UI login steps before every individual test, use a setup project in `playwright.config.ts` to authenticate once and save the state to `playwright/.auth/admin.json`:

```typescript
// tests/e2e/auth.setup.ts
import { test as setup, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

const authFile = 'playwright/.auth/admin.json';

setup('authenticate as IT Admin', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('admin@Satguru Travels.com', 'password123');
  
  // Wait for URL redirect to dashboard
  await page.waitForURL('**/dashboard**');
  await expect(page.locator('h1')).toContainText('Dashboard');

  // Save storage state (cookies & localStorage containing JWT)
  await page.context().storageState({ path: authFile });
});
```

---

## 5. Network Interception & ZATCA Mocking Patterns

When testing UI error handling (e.g., verifying that the dashboard displays a warning badge when ZATCA is unreachable), intercept network requests:

```typescript
test('displays DLQ retry badge when ZATCA API returns 503', async ({ page }) => {
  // Intercept backend call to ZATCA and force a 503 Service Unavailable
  await page.route('**/api/erp/invoices/submit', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        status: 'DLQ',
        message: 'ZATCA Core API Unreachable. Queued for retry.'
      })
    });
  });

  // Trigger invoice submission from UI
  await page.getByRole('button', { name: 'Submit Test Invoice' }).click();

  // Assert UI feedback
  const statusBadge = page.locator('.badge-dlq, [data-status="DLQ"]');
  await expect(statusBadge).toBeVisible();
  await expect(page.getByText('Queued for retry')).toBeVisible();
});
```

---

## 6. Continuous Integration (CI/CD) Execution Guide

To run Playwright automated tests in headless mode inside GitHub Actions or GitLab CI:

### Command Line Execution:
```bash
# Run all E2E specs in headless chromium
npx playwright test tests/e2e/ --project=chromium

# Run test spec with UI debug inspector
npx playwright test tests/e2e/zatca-flow.spec.ts --ui

# Generate HTML Test Report
npx playwright show-report
```

### GitHub Actions Step Example:
```yaml
- name: Run Playwright E2E Tests
  run: |
    npm run dev:all &
    npx wait-on http://localhost:5173
    npx playwright test tests/e2e/
  env:
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/zatca_test"
    JWT_SECRET: "test_secret_key"
```

---

## 7. Handover Verification Spec

An executable Playwright test script has been generated at **`tests/e2e/zatca-flow.spec.ts`**. It tests:
1. IT Admin Login & JWT session creation.
2. Dashboard KPI verification.
3. API ERP submission verification with HMAC headers.
4. UI Invoice list status reflection.
