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

    for (const [label, size] of [["portrait", { width: 390, height: 844 }], ["wide", WIDE[0]]] as const) {
      test(`${label} with news`, async ({ page }) => {
        const now = new Date().toISOString().replace("T", " ");
        await page.route("https://cms.grid.test/api/collections/news/records*", (r) =>
          r.fulfill({
            json: {
              items: [
                { id: "n1", title_en: "Planned maintenance notice", title_pap: "", body_en: "Text.", body_pap: "", severity: "important", link: "https://example.org", pinned: true, publishedAt: now, expiresAt: "" },
                { id: "n2", title_en: "Method update", title_pap: "", body_en: "Text.", body_pap: "", severity: "notice", link: "", pinned: false, publishedAt: now, expiresAt: "" },
              ],
            },
          }),
        );
        await page.setViewportSize(size);
        await open(page);
        await page.locator("#news .ntitle").first().click();
        await scan(page);
      });
    }

    test("wide with site card", async ({ page }) => {
      await page.setViewportSize(WIDE[0]);
      await open(page);
      await page.locator(".site").first().click();
      await scan(page);
    });
  });
}
