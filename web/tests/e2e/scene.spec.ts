import { expect, test } from "@playwright/test";
import { open, setMode, sites } from "./helpers";

// Spec 4.3, 7.5, 11: the scene holds the seed sites by naming contract, and no sun, solar
// or battery objects in either mode.

for (const mode of ["day", "night"] as const) {
  test(`scene objects in ${mode} mode`, async ({ page }) => {
    await setMode(page, mode);
    await open(page);
    const names = await page.evaluate(() => window.__gridWatch!.objectNames());
    for (const s of sites) expect(names).toContain(`site_${s.slug}`);
    expect(names).toContain("island");
    expect(names.filter((n) => /sun|solar|battery|bess/i.test(n))).toEqual([]);
    if (mode === "night") expect(names).toContain("stars");
  });
}

test("Tera Kora shows one turbine cluster per park", async ({ page }) => {
  await open(page);
  const counts = await page.evaluate(() => {
    const names = window.__gridWatch!.objectNames();
    return names.filter((n) => n === "turbine").length;
  });
  // three turbines per park: Tera Kora (2 parks) + Playa Kanoa + Koraal Tabak
  expect(counts).toBe(3 * (2 + 1 + 1));
});
