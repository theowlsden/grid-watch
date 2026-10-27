import { readFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, open, test } from "./helpers";

// The public report form (decision 26). Cloudflare's Turnstile script is replaced by a stand-in
// served from the same address, so the CSP is exercised but nothing calls Cloudflare.
const en: Record<string, string> = JSON.parse(readFileSync(join(__dirname, "..", "..", "src", "i18n", "en.json"), "utf8"));
const CMS = "https://cms.grid.test";
const TURNSTILE = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const FAKE_TURNSTILE = `window.turnstile = { render(el, o) { el.textContent = "check passed"; setTimeout(() => o.callback("test-token"), 50); return "w1"; }, reset() {} };`;

test.use({ viewport: { width: 390, height: 844 } });

async function openForm(page: import("@playwright/test").Page, sent: unknown[] = [], reply = { status: 200, json: { id: "r1" } as object }) {
  await page.route("**/config.json", (r) => r.fulfill({ json: { cmsOrigin: CMS, events: "true", results: "", analytics: "", turnstile: "0x4AAAAAAAtest-sitekey" } }));
  await page.route(TURNSTILE, (r) => r.fulfill({ contentType: "text/javascript", body: FAKE_TURNSTILE }));
  await page.route(`${CMS}/api/collections/reports/records`, async (r) => {
    sent.push(r.request().postDataJSON());
    await r.fulfill({ status: reply.status, json: reply.json });
  });
  await page.goto("/report");
  await expect(page.locator(".turnstile")).toHaveText("check passed");
}

test("closed until a Turnstile site key is set", async ({ page }) => {
  await page.goto("/report");
  await expect(page.locator("main")).toContainText(en["report.closed"]);
  await expect(page.locator("form")).toHaveCount(0);
});

test("a community report: neighbourhoods from the list, the token, and nothing personal is sent", async ({ page }) => {
  const sent: Record<string, unknown>[] = [];
  await openForm(page, sent);
  await page.getByLabel(en["report.start"]).fill("19:30");
  await page.getByLabel(en["report.ongoing"]).check();
  const place = page.getByRole("combobox", { name: en["report.areas.label"], exact: true });
  await place.fill("Atlantis");
  await page.getByRole("button", { name: en["report.areas.add"] }).click();
  await expect(page.locator(".field-error")).toHaveText(en["report.areas.unknown"]);
  await place.fill("punda");
  await place.press("Enter");
  await place.fill("Santa Rosa");
  await page.getByRole("button", { name: en["report.areas.add"] }).click();
  await expect(page.locator(".picked li")).toHaveCount(2);
  await page.getByLabel(en["report.note"]).fill("No power since dinner.");
  await page.getByRole("button", { name: en["report.send"] }).click();
  await expect(page.getByRole("status")).toContainText(en["report.thanks"]);
  expect(sent).toHaveLength(1);
  const b = sent[0];
  expect(b).toMatchObject({ kind: "community", type: "load_shedding", start_time: "19:30", ongoing: true, end_time: "", scope: "areas", areas: ["Punda", "Santa Rosa"], website: "", "cf-turnstile-response": "test-token" });
  expect(Object.keys(b).sort()).toEqual(["areas", "cf-turnstile-response", "date", "end_date", "end_time", "kind", "note", "ongoing", "scope", "source_url", "start_time", "type", "website"]);
});

test("load shedding past midnight: an end time before the start moves the end date to the next day", async ({ page }) => {
  const sent: Record<string, unknown>[] = [];
  await openForm(page, sent);
  const today = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.parse(today) - 86400_000).toISOString().slice(0, 10);
  await page.getByLabel(en["report.date"]).fill(yesterday);
  await page.getByLabel(en["report.start"]).fill("21:00");
  await page.getByLabel(en["report.end"]).fill("12:00");
  await expect(page.getByLabel(en["report.endDate"])).toHaveValue(today);
  await page.getByRole("radio", { name: en["report.where.island"], exact: true }).check();
  await page.getByRole("button", { name: en["report.send"] }).click();
  await expect(page.getByRole("status")).toContainText(en["report.thanks"]);
  expect(sent[0]).toMatchObject({ date: yesterday, start_time: "21:00", end_date: today, end_time: "12:00" });
});

test("an end before the start on the same day is caught before sending", async ({ page }) => {
  const sent: unknown[] = [];
  await openForm(page, sent);
  await page.getByLabel(en["report.start"]).fill("21:00");
  await page.getByLabel(en["report.end"]).fill("12:00"); // today: there is no next day yet
  await expect(page.getByLabel(en["report.endDate"])).toHaveValue(await page.getByLabel(en["report.date"]).inputValue());
  await page.getByRole("radio", { name: en["report.where.island"], exact: true }).check();
  await page.getByRole("button", { name: en["report.send"] }).click();
  await expect(page.locator(".field-error[role=alert]")).toHaveText(en["report.endBefore"]);
  expect(sent).toHaveLength(0);
});

test("a sourced report needs its link; 'a notice' is only offered with a link", async ({ page }) => {
  const sent: unknown[] = [];
  await openForm(page, sent);
  const types = page.getByLabel(en["report.type.h"]);
  await expect(types.locator("option[value=notice]")).toHaveCount(0);
  await page.getByRole("radio", { name: new RegExp(`^${en["report.kind.sourced"].replace(/[()]/g, "\\$&")}`) }).check();
  await expect(types.locator("option[value=notice]")).toHaveCount(1);
  await page.getByRole("radio", { name: en["report.where.island"], exact: true }).check();
  await page.getByRole("button", { name: en["report.send"] }).click();
  expect(sent).toHaveLength(0); // the browser asks for the link first
  await page.getByLabel(en["report.source"]).fill("https://example.org/news");
  await page.getByRole("button", { name: en["report.send"] }).click();
  await expect(page.getByRole("status")).toBeVisible();
  expect(sent[0]).toMatchObject({ kind: "sourced", scope: "island", areas: [], source_url: "https://example.org/news" });
});

test("a refusal from the CMS is shown, and the form can be sent again", async ({ page }) => {
  await openForm(page, [], { status: 400, json: { message: "date: between 2025-01-01 and today" } });
  await page.getByRole("radio", { name: en["report.where.unknown"], exact: true }).check();
  await page.getByRole("button", { name: en["report.send"] }).click();
  await expect(page.locator(".field-error[role=alert]")).toContainText("date: between 2025-01-01 and today");
  await expect(page.getByRole("button", { name: en["report.send"] })).toBeEnabled();
});

test("accessible", async ({ page }) => {
  await openForm(page);
  const res = await new AxeBuilder({ page }).include("main").analyze();
  expect(res.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

test("the events list links to the form and shows grouped community counts as unverified", async ({ page }) => {
  await page.route("**/config.json", (r) => r.fulfill({ json: { cmsOrigin: CMS, events: "true", results: "", analytics: "", turnstile: "0x4AAAAAAAtest-sitekey" } }));
  await page.route(`${CMS}/api/gridwatch/community*`, (r) =>
    r.fulfill({ json: { items: [{ date: "2026-10-20", total: 14, island: 2, unknown: 1, areas: [{ name: "Santa Rosa", count: 9 }, { name: "Mahaai", count: 5 }] }, { date: "2026-10-19", total: 1, island: 0, unknown: 1, areas: [] }] } }),
  );
  await open(page);
  await page.locator("#evBtn").click();
  const panel = page.locator("#events");
  await expect(panel.getByRole("link", { name: new RegExp(en["report.link"]) })).toHaveAttribute("href", "/report");
  const community = panel.locator(".community");
  await expect(community.locator("h3")).toHaveText(en["community.h"]);
  await expect(community.locator("li")).toHaveCount(1); // a single report is never shown
  await expect(community.locator("li")).toContainText("Santa Rosa (9), Mahaai (5), whole island (2), area not given (1)");
});
