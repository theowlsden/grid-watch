import { expect, test, forecastCopy, open, sites } from "./helpers";

// Spec 4.4, 4.6, 7.2, 11: fallbacks and data states.

test.use({ viewport: { width: 390, height: 844 } });

test("without WebGL the sites are a usable list", async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error test override of an overloaded DOM method
    HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
      return /webgl/.test(type) ? null : orig.call(this, type as "2d", ...(rest as []));
    };
  });
  await open(page, { webgl: false });
  await expect(page.locator("#app")).toHaveClass(/no-webgl/);
  await expect(page.locator("#c")).toBeHidden();
  await expect(page.getByText("This browser cannot draw the 3D island")).toBeVisible();
  const buttons = page.locator("#labels .site");
  await expect(buttons).toHaveCount(sites.length);
  for (const s of sites) await expect(page.locator(".site", { hasText: s.name_en })).toBeVisible();
  await page.locator(".site", { hasText: sites[0].name_en }).click();
  await expect(page.locator("#card h2")).toHaveText(sites[0].name_en);
});

test("example data always carries the example tag", async ({ page }) => {
  await open(page);
  await expect(page.locator("#hud .tag")).toHaveText("Example data, not a live forecast");
});

test("live data has no example tag and no probability wording", async ({ page }) => {
  const live = forecastCopy();
  live.data_mode = "live";
  live.sources = [{ name: "Open-Meteo", url: "https://open-meteo.com/", retrieved_at: "2026-10-07T11:00:00Z" }];
  await page.route("**/data/forecast.json", (r) => r.fulfill({ json: live }));
  await open(page);
  await expect(page.locator("#hud .tag")).toHaveCount(0);
  await expect(page.locator("#hud")).toContainText("Not a probability");
  await expect(page.locator("body")).not.toContainText(/chance of|probability of/i);
});

test.fixme("stale data shows 'Data out of date' and greys the statuses (Phase 2, spec 7.2)", async () => {});

test("forecast that fails to load shows a message, page stays usable", async ({ page }) => {
  await page.route("**/data/forecast.json", (r) => r.fulfill({ status: 500 }));
  await page.goto("/");
  await expect(page.locator("#hud")).toContainText("The outlook could not be loaded");
  await expect(page.locator("#topbar")).toBeVisible();
});

test("no events yet: the panel says sources are being collected", async ({ page }) => {
  await open(page);
  await page.locator("#evBtn").click();
  await expect(page.locator("#events")).toBeVisible();
  await expect(page.locator("#events")).toContainText("Sources for the reported events are being collected");
  await page.keyboard.press("Escape");
  await expect(page.locator("#events")).toBeHidden();
});

test("published events link their source safely and render text as text", async ({ page }) => {
  const event = {
    id: "2026-10-06-test",
    title: "Controlled outages",
    start_local: "2026-10-06",
    end_local: null,
    type: "controlled_switching",
    severity: "minor",
    drivers: [],
    summary: "<img src=x onerror=alert(1)> Text with markup",
    sources: [{ publisher: "Example News", title: "Report", url: "https://example.org/a", published_at: "2026-10-06", retrieved_at: "2026-10-07" }],
    verified: true,
  };
  await page.route("**/data/events.json", (r) => r.fulfill({ json: [event] }));
  await open(page);
  await page.locator("#evBtn").click();
  const panel = page.locator("#events");
  await expect(panel).toContainText("<img src=x onerror=alert(1)> Text with markup");
  await expect(panel.locator("img")).toHaveCount(0);
  const link = panel.getByRole("link", { name: "Source: Example News" });
  await expect(link).toHaveAttribute("href", "https://example.org/a");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
});

test("invalid events file leaves the page intact", async ({ page }) => {
  await page.route("**/data/events.json", (r) => r.fulfill({ body: "not json", contentType: "application/json" }));
  await open(page);
  await expect(page.locator("#hud .pct")).toBeVisible();
});

test.describe("404 page", () => {
  test("shows the bolt and a way back, still with reduced motion", async ({ page }) => {
    const res = await page.goto("/does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.locator(".notfound .bolt")).toBeVisible();
    await expect(page.locator(".notfound .bolt")).toHaveCSS("animation-name", "none");
    await page.getByRole("link", { name: "Back to Grid Watch Curaçao" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test.describe("with motion", () => {
    test.use({ reducedMotion: "no-preference" });
    test("the bolt blinks", async ({ page }) => {
      await page.goto("/does-not-exist");
      await expect(page.locator(".notfound .bolt")).toHaveCSS("animation-name", "bolt-flicker");
    });
  });
});
