import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test, open, setMode, WIDE } from "./helpers";

// Spec 4.8, 11: axe scan (WCAG 2.x A and AA) on the main states, day and night.

async function scan(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(summary).toEqual([]);
}

for (const mode of ["day", "night"] as const) {
  test.describe(`${mode}`, () => {
    test.beforeEach(async ({ page }) => setMode(page, mode));

    test("portrait", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page);
      await scan(page);
    });

    test("portrait with site card", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page);
      await page.locator(".site").first().evaluate((b: HTMLButtonElement) => b.click());
      await expect(page.locator("#card")).toBeVisible();
      await scan(page);
    });

    test("portrait with events panel", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page);
      await page.locator("#evBtn").click();
      await scan(page);
    });

    test("landscape", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await open(page);
      await scan(page);
    });

    test("wide with site card", async ({ page }) => {
      await page.setViewportSize(WIDE[0]);
      await open(page);
      await page.locator(".site").first().click();
      await scan(page);
    });
  });
}
