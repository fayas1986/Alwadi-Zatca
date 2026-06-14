import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

test.describe('Authentication', () => {
  test('should display login screen with correct roles', async ({ page }) => {
    const loginPage = new LoginPage(page);

    await test.step('Navigate to application', async () => {
      await loginPage.goto();
    });

    await test.step('Verify roles are available', async () => {
      await expect(loginPage.itAdminRoleButton).toBeVisible();
      await expect(loginPage.financeAdminRoleButton).toBeVisible();
      await expect(loginPage.taxOfficerRoleButton).toBeVisible();
    });

    await test.step('Fill in login credentials', async () => {
      await loginPage.emailInput.fill('admin@tech-solutions.sa');
      await loginPage.passwordInput.fill('password123');
    });

    await test.step('Verify sign in button is visible', async () => {
      await expect(loginPage.signInButton).toBeVisible();
    });
  });
});
