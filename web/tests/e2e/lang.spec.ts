import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, open, snapshot, test } from "./helpers";

// Spec 4.7: EN / PAP toggle, stored choice, English fallback per key, *_pap content from the CMS.
const en: Record<string, string> = JSON.parse(readFileSync(join(__dirname, "..", "..", "src", "i18n", "en.json"), "utf8"));
const pap: Record<string, string> = JSON.parse(readFileSync(join(__dirname, "..", "..", "src", "i18n", "pap.json"), "utf8"));
// what the bundled files show for a key in PAP: Papiamentu where it exists, English otherwise
const bundled = (k: string) => pap[k] || en[k];
const papCoverage = Object.keys(en).filter((k) => pap[k]).length / Object.keys(en).length;
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

test("PAP shows the bundled text (English where untranslated), never a key name", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gridwatch-lang", "pap"));
  await open(page);
  await expect(page.locator("#hud .pill")).toHaveText(bundled("level.low"));
  const text = await page.locator("body").innerText();
  const leaked = Object.keys(en).filter((k) => text.includes(k));
  expect(leaked).toEqual([]);
  // the "being reviewed" note shows only while under 95 % is translated
  if (papCoverage < 0.95) await expect(page.locator(".langnote").filter({ visible: true })).toBeVisible();
  else await expect(page.locator(".langnote").filter({ visible: true })).toHaveCount(0);
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

// Papiamentu interface text published in the CMS (translations collection)
const TRANSLATIONS = `${CMS}/api/collections/translations/records*`;
const placeholderKey = Object.keys(en).find((k) => en[k].includes("{") && !k.startsWith("method."))!;

test("published CMS translations replace the bundled text; unfit rows are ignored", async ({ page }) => {
  let asked = 0;
  await page.route(TRANSLATIONS, (r) => {
    asked++;
    return r.fulfill({
      json: {
        items: [
          { key: "level.low", pap: "TEST low" },
          { key: "made.up.key", pap: "never shown" },
          // placeholders differ from English: stays English
          { key: placeholderKey, pap: "no placeholders" },
          { key: "level.high", pap: "<b>TEST</b>" },
        ],
      },
    });
  });
  await open(page);
  expect(asked, "English visitors do not ask the CMS").toBe(0);
  await page.locator("#topbar").getByRole("button", { name: "Papiamentu" }).click();
  await expect(page.locator("#hud .pill")).toHaveText("TEST low");
  expect(await page.locator("body").innerText()).not.toContain("no placeholders");
  // text is text, never markup
  expect(await page.locator("b", { hasText: "TEST" }).count()).toBe(0);

  // a repeat visit with the CMS down uses the copy kept in the browser
  await page.unroute(TRANSLATIONS);
  await page.route(`${CMS}/**`, (r) => r.abort("connectionrefused"));
  await page.reload();
  await expect(page.locator("#hud .pill")).toHaveText("TEST low");
});

test("without the CMS the bundled Papiamentu (or English) is used", async ({ page }) => {
  await page.route(`${CMS}/**`, (r) => r.abort("connectionrefused"));
  await page.addInitScript(() => localStorage.setItem("gridwatch-lang", "pap"));
  await open(page);
  await expect(page.locator("#hud .pill")).toHaveText(bundled("level.low"));
});

test("the methodology page uses CMS translations too", async ({ page }) => {
  await page.route(TRANSLATIONS, (r) => r.fulfill({ json: { items: [{ key: "method.title", pap: "TEST method title" }] } }));
  await page.addInitScript(() => localStorage.setItem("gridwatch-lang", "pap"));
  await page.goto("/methodology");
  await expect(page.locator('main.doc[lang="pap"] h1')).toHaveText("TEST method title");
  await expect(page.locator('main.doc[lang="en"] h1')).toHaveText(en["method.title"]);
});
