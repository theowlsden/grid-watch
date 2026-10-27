import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./helpers";

// Decision 27: the data that would make the outlook testable, linked from the methodology page.
const en: Record<string, string> = JSON.parse(readFileSync(join(__dirname, "..", "..", "src", "i18n", "en.json"), "utf8"));

test.use({ viewport: { width: 390, height: 844 } });

test("the methodology page links to the data page, which lists the minimal set", async ({ page }) => {
  await page.goto("/methodology");
  await page.locator("main.doc").filter({ visible: true }).getByRole("link", { name: new RegExp(en["data.link"]) }).click();
  await expect(page).toHaveURL(/\/data$/);
  const main = page.locator("main.doc").filter({ visible: true });
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(en["data.title"]);
  await expect(main.locator(".datalist h3")).toHaveText(["events", "load", "available", "wind", "maintenance"].map((id) => en[`data.item.${id}.h`]));
  await expect(main.getByRole("link", { name: en["data.help.issue"] })).toHaveAttribute("href", /github\.com\/.+\/issues/);
  await expect(main.getByRole("link", { name: new RegExp(en["report.link"]) })).toHaveCount(0); // the form is closed
});

test("the report form is linked while it is open", async ({ page }) => {
  await page.route("**/config.json", (r) => r.fulfill({ json: { cmsOrigin: "https://cms.grid.test", events: "", results: "", analytics: "", turnstile: "0x4AAAAAAAtest-sitekey" } }));
  await page.goto("/data");
  const main = page.locator("main.doc").filter({ visible: true });
  await expect(main.getByRole("link", { name: new RegExp(en["report.link"]) })).toHaveAttribute("href", "/report");
});

test("the data page passes an accessibility scan", async ({ page }) => {
  await page.goto("/data");
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(result.violations.map((v) => v.id)).toEqual([]);
});
