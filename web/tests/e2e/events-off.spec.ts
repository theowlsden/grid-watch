import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, open, test, WIDE } from "./helpers";

// The reported events section is off unless the runtime config switches it on
// (EVENTS_ENABLED, deploy/web/Caddyfile). The "cannot show" note stays reachable (spec 4.6).
const en: Record<string, string> = JSON.parse(readFileSync(join(__dirname, "..", "..", "src", "i18n", "en.json"), "utf8"));
const EVENT = {
  id: "2026-10-06-test",
  start_local: "2026-10-06",
  end_local: null,
  type: "controlled_switching",
  severity: "minor",
  drivers: [],
  summary: "Test event.",
  sources: [{ publisher: "Test", title: "Report", url: "https://example.org/report", published_at: "2026-10-06", retrieved_at: "2026-10-07" }],
  verified: true,
};

test.beforeEach(async ({ page }) => {
  await page.route("**/config.json", (r) => r.fulfill({ json: { cmsOrigin: "", events: "" } }));
  // even with published events, nothing shows while the section is off
  await page.route("**/data/events.json", (r) => r.fulfill({ json: [EVENT] }));
});

test("phone: a note button instead of reported events, and the note opens and closes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const btn = page.locator("#evBtn");
  await expect(btn).toHaveText(en["limits.button"]);
  await btn.click();
  const panel = page.locator("#events");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("What this page cannot show");
  await expect(panel.locator(".evl li")).toHaveCount(0);
  await expect(panel).not.toContainText(en["events.title"]);
  await panel.getByRole("button", { name: en["limits.close"] }).click();
  await expect(panel).toBeHidden();
  await expect(btn).toBeFocused();
});

test("wide: no events card, the note sits under the chart", async ({ page }) => {
  await page.setViewportSize(WIDE[0]);
  await open(page);
  await expect(page.locator("#evCard")).toHaveCount(0);
  await expect(page.locator("#week .weeknote")).toBeVisible();
});

test("events.json is not even requested while the section is off", async ({ page }) => {
  let asked = false;
  await page.route("**/data/events.json", (r) => {
    asked = true;
    return r.fulfill({ json: [EVENT] });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.waitForTimeout(500);
  expect(asked).toBe(false);
});

test("the switch reads true, 1, yes and on", async ({ page }) => {
  for (const value of ["true", "1", "yes", "ON"]) {
    await page.route("**/config.json", (r) => r.fulfill({ json: { cmsOrigin: "", events: value } }));
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await expect(page.locator("#evBtn"), value).toHaveText(en["events.button"]);
  }
});
