import { readFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, open, test } from "./helpers";

// First-visit notice (spec 8.2): shown once per browser, before the numbers are read.
const en: Record<string, string> = JSON.parse(readFileSync(join(__dirname, "..", "..", "src", "i18n", "en.json"), "utf8"));
test.use({ introSeen: false, viewport: { width: 390, height: 844 } });

test("a first visit shows the notice; closing it is remembered", async ({ page }) => {
  await open(page);
  const dialog = page.getByRole("dialog", { name: en["intro.title"] });
  await expect(dialog).toBeVisible();
  for (const k of ["intro.p1", "intro.p2", "intro.p3"]) await expect(dialog).toContainText(en[k]);
  // the main button has focus, so Enter or a tap closes it
  const ok = dialog.getByRole("button", { name: en["intro.ok"] });
  await expect(ok).toBeFocused();
  await ok.click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(page.locator("#hud .pct")).toBeVisible();
  await expect(page.locator("#intro")).toBeHidden();
});

test("Esc closes it too, and counts as read", async ({ page }) => {
  await open(page);
  await expect(page.locator("#intro")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#intro")).toBeHidden();
  await page.reload();
  await expect(page.locator("#hud .pct")).toBeVisible();
  await expect(page.locator("#intro")).toBeHidden();
});

test("the page behind cannot be used until it is closed", async ({ page }) => {
  await open(page);
  await expect(page.locator("#intro")).toBeVisible();
  // opened as a modal dialog, which makes the rest of the page inert
  expect(await page.locator("#intro").evaluate((d) => d.matches(":modal"))).toBe(true);
  // a click on the page behind does not reach it
  const ev = page.locator("#evBtn");
  await ev.click({ force: true, timeout: 2000 }).catch(() => {});
  await expect(page.locator("#events")).toBeHidden();
});

test("the language can be switched in the notice", async ({ page }) => {
  await open(page);
  await page.locator('#intro .seg.lang button[lang="pap"]').click();
  await expect(page.locator("html")).toHaveAttribute("lang", "pap");
  await expect(page.locator("#intro")).toBeVisible();
});

test("'How this works' leads to the methodology page, which shows no notice", async ({ page }) => {
  await open(page);
  await page.locator("#intro").getByRole("link", { name: en["intro.more"] }).click();
  await expect(page).toHaveURL(/\/methodology\/?$/);
  await expect(page.locator("#intro")).toHaveCount(0);
});

for (const mode of ["day", "night"] as const) {
  test(`accessible in ${mode} mode`, async ({ page }) => {
    await page.addInitScript((m) => localStorage.setItem("gridwatch-mode", m), mode);
    await open(page);
    await expect(page.locator("#intro")).toBeVisible();
    const res = await new AxeBuilder({ page }).include("#intro").analyze();
    expect(res.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}
