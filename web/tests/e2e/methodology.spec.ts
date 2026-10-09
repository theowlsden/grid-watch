import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { expect, open, test } from "./helpers";

// Spec 8.2: the methodology and limits on a linked page, with the rules as configured.
const cfg = parse(readFileSync(join(__dirname, "..", "..", "..", "pipeline", "stress_config.yaml"), "utf8"));

test("the risk card links to the methodology page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.locator("#hud").getByRole("link", { name: "How this works" }).click();
  await expect(page).toHaveURL(/\/methodology$/);
  await expect(page.getByRole("heading", { name: "How Grid Watch works" })).toBeVisible();
});

test("the page shows the configured rules and no probability claims", async ({ page }) => {
  await page.goto("/methodology");
  const main = page.locator("main.doc").filter({ visible: true });
  await expect(main).toContainText(`${cfg.name} version ${cfg.version}`);
  await expect(main).toContainText(`Elevated from ${cfg.levels.elevated}`);
  await expect(main).toContainText(`${cfg.weights.wind} × wind stress`);
  await expect(main).toContainText(`zero below ${cfg.power_curve.cut_in_ms} m/s`);
  await expect(main).toContainText("It is not a probability");
  await expect(main).not.toContainText(/how likely|chance of|predicts? (a )?blackout/i);
  await expect(main.getByRole("link", { name: "Report a correction" })).toHaveAttribute("href", /github\.com\/.+\/issues/);
});

test("the methodology page passes an accessibility scan", async ({ page }) => {
  await page.goto("/methodology");
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(result.violations.map((v) => v.id)).toEqual([]);
});
