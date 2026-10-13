import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, open, test } from "./helpers";

// Cloudflare Web Analytics (decision 22): only with ANALYTICS_TOKEN, within the CSP. The real
// beacon is never loaded in tests; a stand-in answers its URL. The fixture fails on any CSP
// violation, so these tests also prove the policy allows exactly what the beacon needs.
const en: Record<string, string> = JSON.parse(readFileSync(join(__dirname, "..", "..", "src", "i18n", "en.json"), "utf8"));
const BEACON = "https://static.cloudflareinsights.com/beacon.min.js";
const TOKEN = "0123456789abcdef0123456789abcdef";

async function withConfig(page: import("@playwright/test").Page, analytics: string) {
  await page.route("**/config.json", (r) => r.fulfill({ json: { cmsOrigin: "", events: "", results: "", analytics } }));
  // stand-in beacon: reports one page view the way the real one does
  await page.route(BEACON, (r) =>
    r.fulfill({ contentType: "text/javascript", body: 'fetch("https://cloudflareinsights.com/cdn-cgi/rum", { method: "POST", body: "{}" }).catch(() => {});' }),
  );
  await page.route("https://cloudflareinsights.com/**", (r) => r.fulfill({ status: 204 }));
}

test("with a token: the beacon loads with it and reports, without CSP violations", async ({ page }) => {
  await withConfig(page, TOKEN);
  const reported = page.waitForRequest("https://cloudflareinsights.com/cdn-cgi/rum");
  await open(page);
  const script = page.locator(`script[src="${BEACON}"]`);
  await expect(script).toHaveCount(1);
  expect(JSON.parse((await script.getAttribute("data-cf-beacon"))!)).toEqual({ token: TOKEN });
  await reported;
});

test("without a token, or with a malformed one: no beacon, and the methodology page says nothing about analytics", async ({ page }) => {
  for (const value of ["", "not-a-token"]) {
    let asked = false;
    await withConfig(page, value);
    await page.route(BEACON, (r) => {
      asked = true;
      return r.abort();
    });
    await open(page);
    await page.waitForTimeout(300);
    await expect(page.locator(`script[src="${BEACON}"]`)).toHaveCount(0);
    expect(asked).toBe(false);
    await page.goto("/methodology");
    await expect(page.locator('main.doc[lang="en"]')).toContainText(en["method.privacy.p"]);
    await expect(page.locator('main.doc[lang="en"]')).not.toContainText(en["method.privacy.analytics"]);
  }
});

test("with a token the methodology page explains what is counted", async ({ page }) => {
  await withConfig(page, TOKEN);
  await page.goto("/methodology");
  await expect(page.locator('main.doc[lang="en"]')).toContainText(en["method.privacy.analytics"]);
});
