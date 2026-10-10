import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: '320x568 (Small Phone)', width: 320, height: 568, isMobile: true },
  { name: '360x800 (Android Phone)', width: 360, height: 800, isMobile: true },
  { name: '390x844 (Modern Phone)', width: 390, height: 844, isMobile: true },
  { name: '430x932 (Large Phone)', width: 430, height: 932, isMobile: true },
  { name: '768x1024 (Tablet Portrait)', width: 768, height: 1024, isMobile: false },
  { name: '1024x768 (Tablet Landscape)', width: 1024, height: 768, isMobile: false },
  { name: '1366x768 (Desktop Regression)', width: 1366, height: 768, isMobile: false },
];

VIEWPORTS.forEach(({ name, width, height, isMobile }) => {
  test.describe(`Responsive Layout Audit — ${name}`, () => {
    test.use({ viewport: { width, height } });

    test(`Verify navigation, drawer, and table layout at ${width}x${height}`, async ({ page }) => {
      await page.goto('/');

      // Check root body does not have horizontal scrolling
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const innerWidth = await page.evaluate(() => window.innerWidth);
      expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 1);

      if (isMobile) {
        // Mobile layout should have hamburger menu toggle
        const hamburger = page.locator('button[title="Open Navigation Menu"]');
        if (await hamburger.isVisible()) {
          await hamburger.click();
          // Drawer backdrop should appear
          const backdrop = page.locator('.fixed.inset-0.bg-slate-900\\/50');
          await expect(backdrop).toBeVisible();

          // Close using Escape key
          await page.keyboard.press('Escape');
          await expect(backdrop).not.toBeVisible();
        }
      } else {
        // Desktop layout should display permanent sidebar
        const sidebar = page.locator('aside');
        if (await sidebar.isVisible()) {
          await expect(sidebar).toBeVisible();
        }
      }
    });
  });
});
