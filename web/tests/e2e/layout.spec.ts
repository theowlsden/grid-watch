import { expect, test, islandBox, LANDSCAPE, noHorizontalScroll, open, overlaps, PORTRAIT, rect, setMode, WIDE } from "./helpers";

// Spec 4.1, 4.2, 11: every layout in day and night, no sideways scroll, and outside the wide
// layout no overlay may cover the island. Screenshots are attached to the report for review.

for (const mode of ["day", "night"] as const) {
  for (const size of [...PORTRAIT, ...LANDSCAPE]) {
    test(`compact ${size.width}x${size.height} ${mode}: island in its own area`, async ({ page }, info) => {
      await page.setViewportSize(size);
      await setMode(page, mode);
      await open(page);
      await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
      await noHorizontalScroll(page);

      // compact layout: top bar and day strip, no side column cards
      await expect(page.locator("#topbar")).toBeVisible();
      await expect(page.locator("#days")).toBeVisible();
      await expect(page.locator("#brand")).toBeHidden();
      await expect(page.locator("#week")).toBeHidden();

      const island = await islandBox(page);
      const stage = (await rect(page, "#stage"))!;
      expect(island.x0, "island inside its area (left)").toBeGreaterThanOrEqual(stage.x0 - 2);
      expect(island.x1, "island inside its area (right)").toBeLessThanOrEqual(stage.x1 + 2);
      expect(island.y0, "island inside its area (top)").toBeGreaterThanOrEqual(stage.y0 - 2);
      expect(island.y1, "island inside its area (bottom)").toBeLessThanOrEqual(stage.y1 + 2);
      for (const sel of ["#topbar", "#hud", "#days"]) {
        const r = await rect(page, sel);
        if (r) expect(overlaps(island, r), `${sel} must not cover the island`).toBe(false);
      }

      // the required disclaimer is visible without scrolling (spec 8.2)
      await expect(page.getByText("Experimental, built from public data, not an official forecast.").filter({ visible: true })).toBeInViewport();
      await info.attach(`${size.width}x${size.height}-${mode}`, { body: await page.screenshot(), contentType: "image/png" });
    });
  }

  for (const size of WIDE) {
    test(`wide ${size.width}x${size.height} ${mode}: side column and bottom row`, async ({ page }, info) => {
      await page.setViewportSize(size);
      await setMode(page, mode);
      await open(page);
      await noHorizontalScroll(page);
      await expect(page.locator("#brand")).toBeVisible();
      await expect(page.locator("#week")).toBeVisible();
      await expect(page.locator("#topbar")).toBeHidden();
      await expect(page.locator("#days")).toBeHidden();
      const island = await islandBox(page);
      const stage = (await rect(page, "#stage"))!;
      expect(island.x0).toBeGreaterThanOrEqual(stage.x0 - 2);
      expect(island.x1).toBeLessThanOrEqual(stage.x1 + 2);
      await expect(page.getByText("Experimental, built from public data, not an official forecast.").filter({ visible: true })).toBeInViewport();
      await info.attach(`${size.width}x${size.height}-${mode}`, { body: await page.screenshot(), contentType: "image/png" });
    });
  }
}

const EVENT = {
  id: "2026-10-06-test",
  title: "Controlled outages",
  start_local: "2026-10-06",
  end_local: null,
  type: "controlled_switching",
  severity: "minor",
  drivers: [],
  summary: "Test event.",
  sources: [{ publisher: "Test", title: "Report", url: "https://example.org/report", published_at: "2026-10-06", retrieved_at: "2026-10-07" }],
  verified: true,
};

for (const withEvents of [false, true]) {
  test(`wide bottom row ${withEvents ? "with" : "without"} events`, async ({ page }) => {
    if (withEvents) await page.route("**/data/events.json", (r) => r.fulfill({ json: [EVENT] }));
    await page.setViewportSize({ width: 1920, height: 1200 });
    await open(page);
    const week = (await rect(page, "#week"))!;
    const below = (await rect(page, "#below"))!;
    if (withEvents) {
      await expect(page.locator("#evCard")).toBeVisible();
      // columns 1.9fr and 1fr: the chart takes about 65 percent of the row
      expect((week.x1 - week.x0) / (below.x1 - below.x0)).toBeGreaterThan(0.6);
      await expect(page.locator("#week .weeknote")).toHaveCount(0);
    } else {
      await expect(page.locator("#evCard")).toHaveCount(0);
      expect(week.x1 - week.x0).toBeGreaterThan(below.x1 - below.x0 - 2);
    }
    // the "cannot show" note stays visible either way (spec 4.6)
    await expect(page.getByText(/What this page cannot show/).filter({ visible: true })).toBeInViewport();
    // no day column runs under the threshold labels
    const labels = await page.locator("#plot .gl span").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left));
    const cols = await page.locator("#plot .col").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
    expect(Math.max(...cols)).toBeLessThanOrEqual(Math.min(...labels));
  });
}

test("wide layout needs at least 1182 px of height", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1181 });
  await open(page);
  await expect(page.locator("#topbar")).toBeVisible();
  await page.setViewportSize({ width: 1600, height: 1182 });
  await expect(page.locator("#brand")).toBeVisible();
  await expect(page.locator("#topbar")).toBeHidden();
});

test("map data is credited to OpenStreetMap (spec 8.3)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const credit = page.getByRole("link", { name: "Map data from OpenStreetMap" });
  await expect(credit).toBeVisible();
  await expect(credit).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
  await expect(credit).toHaveAttribute("rel", "noopener noreferrer");
});
