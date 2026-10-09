import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, open, snapshot, test } from "./helpers";

// Spec 4.7: EN / PAP toggle, stored choice, English fallback per key, *_pap content from the CMS.
const en: Record<string, string> = JSON.parse(readFileSync(join(__dirname, "..", "..", "src", "i18n", "en.json"), "utf8"));
const CMS = "https://cms.grid.test";

test.use({ viewport: { width: 390, height: 844 } });

test("English by default; PAP is remembered and sets the page language", async ({ page }) => {
  await open(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const pap = page.locator("#topbar").getByRole("button", { name: "Papiamentu" });
  await expect(page.locator("#topbar").getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
  await pap.click();
  await expect(pap).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("lang", "pap");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "pap");
  await expect(page.locator("#topbar").getByRole("button", { name: "Papiamentu" })).toHaveAttribute("aria-pressed", "true");
});

test("untranslated text falls back to English, never to a key name", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gridwatch-lang", "pap"));
  await open(page);
  await expect(page.locator("#hud .pill")).toHaveText(en["level.low"]);
  const text = await page.locator("body").innerText();
  const leaked = Object.keys(en).filter((k) => text.includes(k));
  expect(leaked).toEqual([]);
  await expect(page.locator(".langnote").filter({ visible: true })).toBeVisible();
});

test("Papiamentu fields from the CMS are used in PAP", async ({ page }) => {
  const now = new Date().toISOString().replace("T", " ");
  await page.route(`${CMS}/api/collections/news/records*`, (r) =>
    r.fulfill({ json: { items: [{ id: "n1", title_en: "English title", title_pap: "Titulo na papiamentu", body_en: "English body", body_pap: "Teksto na papiamentu", severity: "info", link: "", pinned: false, publishedAt: now, expiresAt: "" }] } }),
  );
  await page.route(`${CMS}/api/collections/sites/records*`, (r) =>
    r.fulfill({ json: { items: snapshot.sites.map((s, i) => ({ id: `r${i}`, ...s, name_pap: s.slug === "dokweg" ? "Planta di Dokweg" : "" })) } }),
  );
  await page.addInitScript(() => localStorage.setItem("gridwatch-lang", "pap"));
  await open(page);
  await expect(page.locator("#news")).toContainText("Titulo na papiamentu");
  await page.locator("#news .ntitle").click();
  await expect(page.locator("#news")).toContainText("Teksto na papiamentu");
  await expect(page.locator(".site", { hasText: "Planta di Dokweg" })).toHaveCount(1);
  // sites without a Papiamentu name keep the English one
  await expect(page.locator(".site", { hasText: snapshot.sites.find((s) => s.slug === "terakora")!.name_en })).toHaveCount(1);
});

test("the methodology page follows the chosen language", async ({ page }) => {
  await page.goto("/methodology");
  await expect(page.locator('main.doc[lang="en"]')).toBeVisible();
  await expect(page.locator('main.doc[lang="pap"]')).toBeHidden();
  await page.evaluate(() => localStorage.setItem("gridwatch-lang", "pap"));
  await page.reload();
  await expect(page.locator('main.doc[lang="pap"]')).toBeVisible();
  await expect(page.locator('main.doc[lang="en"]')).toBeHidden();
});
