import { expect, test } from '@playwright/test';

const months = ['2025-02', '2024-02', '2026-04', '2026-07'];
const themes = ['light', 'dark'] as const;
const widths = [375, 768, 1440];

for (const month of months) {
  for (const theme of themes) {
    for (const width of widths) {
      test(`${month} ${theme} ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/tests/visual/index.html?month=${month}&theme=${theme}`);
        await expect(page.locator('.ttgp-board')).toBeVisible();
        await expect(page.locator('.ttgp-day')).toHaveCount(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate());
        await expect(page).toHaveScreenshot(`dashboard-${month}-${theme}-${width}.png`, { animations: 'disabled' });
      });
    }
  }
}
