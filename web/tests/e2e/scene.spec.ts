import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, open, setMode, sites } from "./helpers";

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

test.describe("handmade models (spec 7.5)", () => {
  test("a site_<slug> node replaces the code model; nodes without a record stay hidden", async ({ page }) => {
    const glb = readFileSync(join(__dirname, "..", "fixtures", "sites.glb"));
    await page.route("**/models/manifest.json", (r) => r.fulfill({ json: { scene: "fixture.glb" } }));
    await page.route("**/models/fixture.glb", (r) => r.fulfill({ body: glb, contentType: "model/gltf-binary" }));
    await open(page);
    await page.waitForFunction(() => window.__gridWatch!.objectNames().includes("model_site_dokweg"));
    const names = await page.evaluate(() => window.__gridWatch!.objectNames());
    expect(names).not.toContain("power_plant"); // the code-built plant is replaced
    expect(names).not.toContain("site_nowhere"); // no record: never added to the scene
    expect(names.filter((n) => n === "turbine").length).toBe(12); // other sites keep their code models
  });

  test("no model in the manifest keeps the code models", async ({ page }) => {
    await open(page);
    await page.waitForTimeout(500);
    const names = await page.evaluate(() => window.__gridWatch!.objectNames());
    expect(names).toContain("power_plant");
    expect(names.some((n) => n.startsWith("model_"))).toBe(false);
  });
});
