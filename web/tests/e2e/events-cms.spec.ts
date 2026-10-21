import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, open, test } from "./helpers";

// Events and notices from the CMS (decision 25): "Ongoing" until the end is known, then the
// period with times; scope and cause chips; notices beside news under their own label.
const en: Record<string, string> = JSON.parse(readFileSync(join(__dirname, "..", "..", "src", "i18n", "en.json"), "utf8"));
const CMS = "https://cms.grid.test";

/** A Curaçao local time (UTC-4) `hours` from now, as the CMS stores it. */
function localAt(hours: number): string {
  const t = new Date(Date.now() + hours * 3600_000 - 4 * 3600_000);
  return t.toISOString().slice(0, 16) + ":00-04:00";
}

const SRC = { source_publisher: "Aqualectra", source_title: "Notice", source_url: "https://example.org/n", source_published: "2026-10-13", source_retrieved: "2026-10-13" };
const record = (over: Record<string, unknown>) => ({
  type: "load_shedding",
  severity: "minor",
  scope: "unknown",
  areas: [],
  cause: "supply",
  end_local: "",
  summary_en: "Rotating load shedding.",
  summary_pap: "",
  more_sources: null,
  verified: true,
  ...SRC,
  ...over,
});

test.use({ viewport: { width: 390, height: 844 } });

async function withCms(page: import("@playwright/test").Page, events: object[], notices: object[] = []) {
  await page.route(`${CMS}/api/collections/events/records*`, (r) => r.fulfill({ json: { items: events } }));
  await page.route(`${CMS}/api/collections/notices/records*`, (r) => r.fulfill({ json: { items: notices } }));
}

test("ongoing first, without a time; ended events show their period; chips for scope and cause", async ({ page }) => {
  await withCms(page, [
    record({ slug: "a-old", start_local: "2026-08-15", summary_en: "An old single-day event." }),
    record({ slug: "b-ended", start_local: "2026-10-13T14:00:00-04:00", end_local: "2026-10-13T18:30:00-04:00", scope: "island", summary_en: "Ended event." }),
    record({ slug: "c-now", start_local: localAt(-2), scope: "areas", areas: ["Punda", "Otrobanda"], summary_en: "Happening now." }),
    record({ slug: "d-cable", type: "outage", cause: "network", start_local: "2026-10-10T09:00:00-04:00", end_local: "2026-10-10T11:00:00-04:00", summary_en: "A cable fault." }),
  ]);
  await open(page);
  await page.locator("#evBtn").click();
  const items = page.locator("#events .evl li");
  await expect(items).toHaveCount(4);
  const first = items.first();
  await expect(first).toContainText("Happening now.");
  await expect(first.locator(".evstatus")).toHaveText(en["events.ongoing"]);
  await expect(first.locator("time")).not.toContainText(":"); // only the date while ongoing
  await expect(first.locator(".evchips")).toContainText("Punda, Otrobanda");
  const ended = items.filter({ hasText: "Ended event." });
  await expect(ended.locator("time")).toHaveText("13 Oct 2026, 14:00 to 18:30");
  await expect(ended.locator(".evchips")).toContainText(en["events.scope.island"]);
  await expect(ended.locator(".evchips")).toContainText(en["events.cause.supply"]);
  await expect(items.filter({ hasText: "A cable fault." }).locator(".evchips")).toContainText(en["events.cause.network"]);
  await expect(items.filter({ hasText: "An old single-day event." }).locator(".evstatus")).toHaveCount(0);
});

test("an event left without an end for 12 hours says the end time was not reported", async ({ page }) => {
  await withCms(page, [record({ slug: "x", start_local: localAt(-13), summary_en: "Forgotten." })]);
  await open(page);
  await page.locator("#evBtn").click();
  await expect(page.locator("#events .evstatus")).toHaveText(en["events.endUnknown"]);
});

test("Papiamentu summaries are used in PAP", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gridwatch-lang", "pap"));
  await withCms(page, [record({ slug: "p", start_local: "2026-10-13", summary_en: "English.", summary_pap: "Papiamentu." })]);
  await open(page);
  await page.locator("#evBtn").click();
  await expect(page.locator("#events .evl li")).toContainText("Papiamentu.");
});

test("without the CMS the stored copy is used", async ({ page }) => {
  await page.route(`${CMS}/**`, (r) => r.abort("connectionrefused"));
  await page.route("**/data/events.json", (r) =>
    r.fulfill({
      json: [
        {
          id: "2026-10-13-stored",
          start_local: "2026-10-13",
          end_local: null,
          type: "load_shedding",
          severity: "minor",
          scope: "unknown",
          cause: "supply",
          drivers: [],
          summary: "From the stored copy.",
          sources: [{ publisher: "Aqualectra", title: "N", url: "https://example.org/n", published_at: "2026-10-13", retrieved_at: "2026-10-13" }],
          verified: true,
        },
      ],
    }),
  );
  await open(page);
  await page.locator("#evBtn").click();
  await expect(page.locator("#events .evl li")).toContainText("From the stored copy.");
});

const NOTICE = {
  id: "n1",
  slug: "2026-10-21-load-shedding",
  title: "",
  publisher: "Aqualectra",
  announced: "load_shedding",
  published_local: "2026-10-21T14:20:00-04:00",
  starts_local: "2026-10-21T18:00:00-04:00",
  ends_local: "2026-10-21T22:00:00-04:00",
  summary_en: "Rotating load shedding this evening.",
  summary_pap: "",
  source_url: "https://example.org/notice",
};

test.describe("notices", () => {
  test.use({ viewport: { width: 1920, height: 1200 } });

  test("shown before news, labelled with the publisher, with the announced period and its source", async ({ page }) => {
    const future = new Date(Date.now() + 6 * 3600_000).toISOString().replace("T", " ");
    await withCms(page, [], [{ ...NOTICE, expiresAt: future }]);
    await page.route(`${CMS}/api/collections/news/records*`, (r) =>
      r.fulfill({ json: { items: [{ id: "news1", title_en: "Project news", title_pap: "", body_en: "A message.", body_pap: "", severity: "info", link: "", pinned: false, publishedAt: "2026-10-20 12:00:00.000Z", expiresAt: "" }] } }),
    );
    await open(page);
    const news = page.locator("#news");
    await expect(news.locator(".newsh")).toHaveText(en["news.titleNotices"]);
    const first = news.locator("li").first();
    await expect(first.locator(".ntag .nfull")).toHaveText("Notice from Aqualectra");
    await expect(first.locator(".ntag .nfull")).toBeVisible();
    await expect(first.locator(".ntag .nshort")).toBeHidden();
    await expect(first.locator(".ntitle")).toHaveText(en["notice.announced.load_shedding"]);
    await first.locator(".ntitle").click();
    await expect(first).toContainText("21 Oct 2026, 18:00 to 22:00");
    await expect(first.getByRole("link", { name: en["notice.source"] })).toHaveAttribute("href", "https://example.org/notice");
    await expect(news.locator("li").nth(1)).toContainText("Project news");
  });

  test("an expired notice is not shown, and notices show even with events switched off", async ({ page }) => {
    await page.route("**/config.json", (r) => r.fulfill({ json: { cmsOrigin: CMS, events: "", results: "" } }));
    const past = new Date(Date.now() - 3600_000).toISOString().replace("T", " ");
    const future = new Date(Date.now() + 3600_000).toISOString().replace("T", " ");
    await withCms(page, [], [
      { ...NOTICE, slug: "old", expiresAt: past, summary_en: "Expired." },
      { ...NOTICE, slug: "live", expiresAt: future, summary_en: "Still current." },
    ]);
    await open(page);
    await expect(page.locator("#news li")).toHaveCount(1);
    await page.locator("#news .ntitle").click();
    await expect(page.locator("#news")).toContainText("Still current.");
  });
});

test("on a phone the notice chip names just the publisher, the full label stays for screen readers", async ({ page }) => {
  const future = new Date(Date.now() + 6 * 3600_000).toISOString().replace("T", " ");
  await withCms(page, [], [{ ...NOTICE, expiresAt: future }]);
  await open(page);
  const tag = page.locator("#news li").first().locator(".ntag");
  await expect(tag.locator(".nshort")).toBeVisible();
  await expect(tag.locator(".nshort")).toHaveText("Aqualectra");
  await expect(tag.locator(".nfull")).toHaveText("Notice from Aqualectra"); // visually hidden, still read out
});

