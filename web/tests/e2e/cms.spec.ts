import type { Page } from "@playwright/test";
import { expect, open, snapshot, test, WIDE } from "./helpers";

// Spec 7.3, 7.4, 11: news from the CMS at runtime, graceful failure, sites from the CMS with
// the committed snapshot as fallback.

const CMS = "https://cms.grid.test";

function pbDate(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString().replace("T", " ");
}

function item(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title_en: `Title ${id}`,
    title_pap: "",
    body_en: `Body ${id}`,
    body_pap: "",
    severity: "info",
    link: "",
    pinned: false,
    publishedAt: pbDate(-2),
    expiresAt: "",
    ...extra,
  };
}

async function serveNews(page: Page, items: unknown[]) {
  await page.route(`${CMS}/api/collections/news/records*`, (r) => r.fulfill({ json: { page: 1, items } }));
}

test.describe("news, wide layout", () => {
  test.use({ viewport: WIDE[0] });

  test("published items appear without a rebuild, as text", async ({ page }) => {
    await serveNews(page, [
      item("a1", { severity: "important", title_en: "<b>Bold?</b> Service note", body_en: "<script>alert(1)</script>\nSecond line", link: "https://example.org/x" }),
      item("a2", { severity: "notice" }),
    ]);
    await open(page);
    const news = page.locator("#news");
    await expect(news).toBeVisible();
    await expect(news.locator("li")).toHaveCount(2);
    await expect(news.locator(".ntag").first()).toHaveText("Important");
    await news.getByRole("button", { name: "<b>Bold?</b> Service note", exact: true }).click();
    await expect(news).toContainText("<script>alert(1)</script>");
    await expect(news.locator("b, script")).toHaveCount(0);
    const link = news.getByRole("link", { name: "More information" });
    await expect(link).toHaveAttribute("href", "https://example.org/x");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    // news never changes the outlook
    await expect(page.locator("#hud .pill")).toHaveText("Low");
  });

  test("expired, future and malformed items are not shown", async ({ page }) => {
    await serveNews(page, [
      item("live"),
      item("old", { expiresAt: pbDate(-1) }),
      item("later", { publishedAt: pbDate(5) }),
      { id: "bad", title_en: "", severity: "info" },
      item("weird", { severity: "panic" }),
      item("http", { link: "http://example.org" }),
    ]);
    await open(page);
    await expect(page.locator("#news li")).toHaveCount(2);
    await expect(page.locator("#news")).toContainText("Title live");
    await page.locator("#news").getByRole("button", { name: "Title http", exact: true }).click();
    await expect(page.locator("#news").getByRole("link")).toHaveCount(0);
  });
});

test.describe("news, phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("one dismissible chip above the day strip; dismissal is remembered", async ({ page }) => {
    await serveNews(page, [item("first", { pinned: true }), item("second")]);
    await open(page);
    const chip = page.locator("#news");
    await expect(chip).toBeVisible();
    await expect(chip.locator("li").first()).toBeVisible();
    await expect(chip.locator("li").nth(1)).toBeHidden();
    const chipBox = (await chip.boundingBox())!;
    const daysBox = (await page.locator("#days").boundingBox())!;
    const stageBox = (await page.locator("#stage").boundingBox())!;
    expect(chipBox.y + chipBox.height).toBeLessThanOrEqual(daysBox.y);
    expect(stageBox.y + stageBox.height, "the chip has its own row, it does not cover the island").toBeLessThanOrEqual(chipBox.y);

    await chip.getByRole("button", { name: "Dismiss: Title first" }).click();
    await expect(chip).toContainText("Title second");
    await page.reload();
    await expect(page.locator("#news")).toContainText("Title second");
    await expect(page.locator("#news")).not.toContainText("Title first");
  });

  test("no news: no chip and no empty row", async ({ page }) => {
    await serveNews(page, []);
    await open(page);
    await expect(page.locator("#news")).toHaveCount(0);
    await expect(page.locator("#app")).not.toHaveClass(/has-news/);
  });

  test("CMS unreachable: page intact, no error, no news", async ({ page }) => {
    await page.route(`${CMS}/**`, (r) => r.abort("connectionrefused"));
    await open(page);
    await expect(page.locator("#hud .pct")).toBeVisible();
    await expect(page.locator("#news")).toHaveCount(0);
    await expect(page.locator(".site", { hasText: snapshot.sites[0].name_en })).toHaveCount(1);
  });

  test("CMS unreachable: the last copy this browser saw is shown", async ({ page }) => {
    await serveNews(page, [item("cached")]);
    await open(page);
    await expect(page.locator("#news")).toContainText("Title cached");
    await page.unroute(`${CMS}/api/collections/news/records*`);
    await page.route(`${CMS}/**`, (r) => r.abort("timedout"));
    await page.reload();
    await expect(page.locator("#news")).toContainText("Title cached");
  });
});

test.describe("sites from the CMS", () => {
  test.use({ viewport: WIDE[0] });

  function cmsSites(edit: (s: Record<string, unknown>[]) => void) {
    const items = snapshot.sites.map((s, i) => ({ id: `r${i}`, collectionName: "sites", ...s, name_pap: s.name_pap ?? "", lat: s.lat ?? 0, lon: s.lon ?? 0 }));
    edit(items);
    return { page: 1, items };
  }

  test("valid CMS records are used", async ({ page }) => {
    await page.route(`${CMS}/api/collections/sites/records*`, (r) =>
      r.fulfill({ json: cmsSites((s) => (s.find((x) => x.slug === "dokweg")!.name_en = "Dokweg plant (from CMS)")) }),
    );
    await open(page);
    await expect(page.locator(".site", { hasText: "Dokweg plant (from CMS)" })).toBeVisible();
  });

  test("invalid CMS data falls back to the snapshot", async ({ page }) => {
    await page.route(`${CMS}/api/collections/sites/records*`, (r) =>
      r.fulfill({ json: cmsSites((s) => (s[0].slug = "Not A Slug")) }),
    );
    await open(page);
    for (const s of snapshot.sites) await expect(page.locator(".site", { hasText: s.name_en })).toBeVisible();
  });

  test("a disabled site in the CMS disappears from the island", async ({ page }) => {
    await page.route(`${CMS}/api/collections/sites/records*`, (r) =>
      r.fulfill({ json: cmsSites((s) => (s.find((x) => x.slug === "koraaltabak")!.enabled = false)) }),
    );
    await open(page);
    await expect(page.locator(".site", { hasText: "Koraal Tabak" })).toHaveCount(0);
    await page.waitForFunction(() => !window.__gridWatch!.objectNames().includes("site_koraaltabak"));
  });
});
