import { expect, test } from '@playwright/test';

test('loads the MFlix application shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'MFlix' })).toBeVisible();
});