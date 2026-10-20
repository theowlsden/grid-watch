import { expect, forecastCopy, open, test } from "./helpers";

// The gauge beside the stress index: band and needle follow the level (thresholds 25, 45, 60),
// the number stays as text, and the gauge itself is decoration (aria-hidden).
const CASES = [
  [18, "low", "ok"],
  [33, "moderate", "watch"],
  [47, "elevated", "warn"],
  [72, "high", "crit"],
] as const;

test.use({ viewport: { width: 390, height: 844 } });

for (const [index, level, tone] of CASES) {
  test(`index ${index} (${level}): ${tone} band lit, ${tone} needle`, async ({ page }) => {
    const f = forecastCopy();
    f.days[0] = { ...f.days[0], index, level };
    await page.route("**/data/forecast.json", (r) => r.fulfill({ json: f }));
    await open(page);
    const g = page.locator("#hud .gauge");
    await expect(g).toHaveAttribute("aria-hidden", "true");
    await expect(g.locator(".band.on")).toHaveCount(1);
    await expect(g.locator(".band.on")).toHaveClass(new RegExp(`t-${tone}`));
    await expect(g.locator(".needle")).toHaveClass(new RegExp(`t-${tone}`));
    await expect(page.locator("#hud .gauge-box .pct")).toContainText(String(index));
  });
}
