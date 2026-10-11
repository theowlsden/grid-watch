import { readFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./helpers";

// Results page (spec 5.3, Phase 3.4): retrospective numbers only, behind RESULTS_ENABLED.
const ROOT = join(__dirname, "..", "..", "..");
const en: Record<string, string> = JSON.parse(readFileSync(join(ROOT, "web", "src", "i18n", "en.json"), "utf8"));
const report = JSON.parse(readFileSync(join(ROOT, "data", "backtests", "rules-v0-gfs.json"), "utf8"));
const visible = (page: import("@playwright/test").Page) => page.locator('main.doc[lang="en"]');

test("switched off: only a short note, no numbers, no link from the methodology page", async ({ page }) => {
  await page.route("**/config.json", (r) => r.fulfill({ json: { cmsOrigin: "", events: "", results: "" } }));
  await page.goto("/results");
  await expect(visible(page)).toContainText(en["results.off"]);
  await expect(visible(page).locator("table")).toHaveCount(0);
  await page.goto("/methodology");
  await expect(page.locator('main.doc[lang="en"]')).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(en["results.link"]) })).toHaveCount(0);
});

test.describe("switched on", () => {
  test("every section from the stored report, caveats with their numbers", async ({ page }) => {
    await page.goto("/results");
    const main = visible(page);
    await expect(main.locator("h1")).toHaveText(en["results.title"]);
    for (const c of report.caveats) {
      // the longest fixed piece of the message, between its {placeholders}
      const piece = en[`results.caveat.${c.id}`].split(/\{\w+\}/).sort((a, b) => b.length - a.length)[0].trim();
      await expect(main.locator("li", { hasText: piece }), c.id).toHaveCount(1);
    }
    if (report.caveats.some((c: { id: string }) => c.id === "place_bias")) await expect(main).toContainText(/10 m wind [+-]\d\.\d m\/s/);
    // weather error: one row per horizon; level table: one row per month
    await expect(main.locator("table").nth(0).locator("tbody tr")).toHaveCount(report.weather_error.wind_ms_10m.length);
    await expect(main.getByRole("row", { name: new RegExp(`^${report.level_frequency[0].month}`) })).toHaveCount(1);
    if (!report.detection.event_evenings) await expect(main).toContainText(en["results.detection.none"]);
    // honest wording only
    const text = await main.innerText();
    expect(text).not.toMatch(/predicted|probability of|chance of/i);
    expect(text).toContain("retrospective");
  });

  test("linked from the methodology page", async ({ page }) => {
    await page.goto("/methodology");
    await page.locator('main.doc[lang="en"]').getByRole("link", { name: new RegExp(en["results.link"]) }).click();
    await expect(page).toHaveURL(/\/results\/?$/);
  });

  test("phone: no sideways page scroll, tables scroll inside their box", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/results");
    await visible(page).locator("table").first().waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });

  for (const mode of ["day", "night"] as const) {
    test(`accessible in ${mode} mode`, async ({ page }) => {
      await page.addInitScript((m) => localStorage.setItem("gridwatch-mode", m), mode);
      await page.goto("/results");
      await visible(page).locator("table").first().waitFor();
      const res = await new AxeBuilder({ page }).include('main.doc[lang="en"]').analyze();
      expect(res.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
  }
});
