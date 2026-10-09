import { expect, test, islandBox, open, rect, sites, WIDE } from "./helpers";

// Spec 4.4, 4.5, 11: every site opens its card, Esc closes it; tapping the island picks sites.

test.describe("portrait phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  for (const site of sites) {
    test(`tap ${site.slug} on the island opens its card`, async ({ page }) => {
      await open(page);
      const pt = await page.evaluate((slug) => window.__gridWatch!.sitePoint(slug), site.slug);
      expect(pt).not.toBeNull();
      await page.mouse.click(pt![0], pt![1]);
      await expect(page.locator("#card")).toBeVisible();
      await expect(page.locator("#card h2")).toHaveText(site.name_en);
      // the hint disappears after the first pick
      await expect(page.locator("#tapHint")).toBeHidden();
      await page.keyboard.press("Escape");
      await expect(page.locator("#card")).toBeHidden();
    });
  }

  test("open card leaves the island in view", async ({ page }) => {
    await open(page);
    await page.locator(".site").first().evaluate((b: HTMLButtonElement) => b.click());
    await expect(page.locator("#card")).toBeVisible();
    const card = (await rect(page, "#card"))!;
    const stage = (await rect(page, "#stage"))!;
    expect(card.y1 - card.y0, "sheet height capped").toBeLessThanOrEqual(stage.y1 - stage.y0 - 120 + 1);
    // the view moves the island up over the next frames
    await expect.poll(async () => (await islandBox(page)).y0, { message: "some of the island stays above the sheet" }).toBeLessThan(card.y0 - 40);
  });

  test("site labels are hidden but reachable by keyboard", async ({ page }) => {
    await open(page);
    const first = page.locator(".site").first();
    expect((await first.boundingBox())!.width).toBeLessThanOrEqual(1);
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#card")).toBeVisible();
  });
});

test.describe("wide desktop", () => {
  test.use({ viewport: WIDE[0] });

  for (const site of sites) {
    test(`label for ${site.slug} opens its card with a leader line`, async ({ page }) => {
      await open(page);
      const label = page.locator(".site", { hasText: site.name_en });
      await expect(label).toBeVisible();
      await label.click();
      await expect(label).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator("#card h2")).toHaveText(site.name_en);
      await expect(page.locator("#ln")).not.toHaveAttribute("hidden", "");
      await page.keyboard.press("Escape");
      await expect(page.locator("#card")).toBeHidden();
      await expect(label).toHaveAttribute("aria-pressed", "false");
    });
  }
});

test("card contents follow the rules in spec 4.5", async ({ page }) => {
  await page.setViewportSize(WIDE[0]);
  await open(page);
  await page.locator(".site", { hasText: "Tera Kora" }).click();
  const card = page.locator("#card");
  await expect(card).toContainText("Parks at this location: Tera Kora I, Tera Kora II");
  await expect(card).toContainText("Estimated output, island total");
  await expect(card).toContainText("estimated");
  await expect(card).toContainText("2024");
  // the open card may cover other labels; close it first, as a visitor would
  await page.keyboard.press("Escape");
  await page.locator(".site", { hasText: "Dokweg" }).click();
  await expect(card).toContainText("Units: not public");
  await expect(card).not.toContainText("Estimated output");
});
