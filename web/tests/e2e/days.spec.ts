import { expect, test } from "@playwright/test";
import { forecast, LEVEL_NAME, open, sites, TONE, WIDE } from "./helpers";

// Spec 4.1, 11: picking a day updates the risk card, the day picker and every site status.

async function expectDay(page: import("@playwright/test").Page, i: number) {
  const d = forecast.days[i];
  await expect(page.locator("#hud .pct")).toContainText(String(d.index));
  await expect(page.locator("#hud .pill")).toHaveText(LEVEL_NAME[d.level]);
  for (const s of sites) {
    const status = s.kind === "wind" ? (d.sites[s.slug]?.status ?? "unknown") : "unknown";
    await expect(page.locator(".site", { hasText: s.name_en }).locator(".dot")).toHaveClass(new RegExp(`lg-${TONE[status]}`));
  }
}

test("day strip (portrait)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const buttons = page.locator("#days button");
  await expect(buttons).toHaveCount(forecast.days.length);
  for (let i = 0; i < forecast.days.length; i++) {
    await buttons.nth(i).click();
    await expect(buttons.nth(i)).toHaveAttribute("aria-pressed", "true");
    await expectDay(page, i);
  }
});

test("week chart (wide) updates the stat tiles too", async ({ page }) => {
  await page.setViewportSize(WIDE[0]);
  await open(page);
  const cols = page.locator("#plot .col");
  for (let i = 0; i < forecast.days.length; i++) {
    await cols.nth(i).click();
    await expect(cols.nth(i)).toHaveAttribute("aria-pressed", "true");
    await expectDay(page, i);
    await expect(page.locator("#stats .stat").first()).toContainText(forecast.days[i].drivers.wind_ms_100m.toFixed(1));
  }
});

test("arrow keys move between days (spec 4.8)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const buttons = page.locator("#days button");
  await buttons.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(buttons.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(buttons.nth(1)).toBeFocused();
  await page.keyboard.press("End");
  await expect(buttons.last()).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Home");
  await expect(buttons.first()).toHaveAttribute("aria-pressed", "true");
});

test("day buttons have readable labels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const d = forecast.days[3];
  await expect(page.locator("#days button").nth(3)).toHaveAttribute(
    "aria-label",
    new RegExp(`^\\w+day \\d+ \\w+, stress index ${d.index}, ${LEVEL_NAME[d.level]}$`),
  );
});
