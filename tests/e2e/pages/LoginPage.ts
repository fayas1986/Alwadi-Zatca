import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
    readonly page: Page;
    readonly itAdminRoleButton: Locator;
    readonly financeAdminRoleButton: Locator;
    readonly taxOfficerRoleButton: Locator;
    readonly emailInput: Locator;
    readonly passwordInput: Locator;
    readonly signInButton: Locator;

    constructor(page: Page) {
        this.page = page;
        this.itAdminRoleButton = page.getByRole('button', { name: /IT Administrator/i });
        this.financeAdminRoleButton = page.getByRole('button', { name: /Finance Manager/i });
        this.taxOfficerRoleButton = page.getByRole('button', { name: /Tax Officer/i });
        this.emailInput = page.getByPlaceholder('name@company.com');
        this.passwordInput = page.getByPlaceholder('••••••••');
        this.signInButton = page.getByRole('button', { name: /Sign In/i });
    }

    async goto() {
        await this.page.goto('/');
        // Wait for branding to ensure page is loaded
        await expect(this.page.getByText('ZATCAConnect')).toBeVisible();
    }

    async selectRole(role: 'IT_ADMIN' | 'FINANCE_ADMIN' | 'TAX_OFFICER') {
        if (role === 'IT_ADMIN') await this.itAdminRoleButton.click();
        else if (role === 'FINANCE_ADMIN') await this.financeAdminRoleButton.click();
        else if (role === 'TAX_OFFICER') await this.taxOfficerRoleButton.click();
    }

    async login(email: string, password: string, role: 'IT_ADMIN' | 'FINANCE_ADMIN' | 'TAX_OFFICER' = 'IT_ADMIN') {
        await this.selectRole(role);
        await this.emailInput.fill(email);
        await this.passwordInput.fill(password);
        await this.signInButton.click();
    }
}
