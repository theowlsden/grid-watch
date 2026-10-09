import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import type { Forecast, SitesSnapshot } from "../../src/lib/schema";

const ROOT = join(__dirname, "..", "..", "..");
export const forecast: Forecast = JSON.parse(readFileSync(join(ROOT, "web/public/data/forecast.json"), "utf8"));
export const snapshot: SitesSnapshot = JSON.parse(readFileSync(join(ROOT, "data/sites.snapshot.json"), "utf8"));
export const sites = snapshot.sites.filter((s) => s.enabled);

export const LEVEL_NAME = { low: "Low", moderate: "Moderate", elevated: "Elevated", high: "High" } as const;
export const TONE = { low: "ok", moderate: "watch", elevated: "warn", high: "crit", unknown: "unknown" } as const;

// Layout sizes from spec 4.2 / 11, grouped by the layout they must produce.
export const PORTRAIT = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
];
export const LANDSCAPE = [
  { width: 844, height: 390 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
];
export const WIDE = [{ width: 1920, height: 1200 }];

export async function setMode(page: Page, mode: "auto" | "day" | "night") {
  await page.addInitScript((m) => localStorage.setItem("gridwatch-mode", m), mode);
}

/** Open the dashboard and wait until the forecast is shown and the island has rendered. */
export async function open(page: Page, { webgl = true } = {}) {
  await page.goto("/");
  await expect(page.locator("#hud .pct")).toBeVisible();
  if (webgl) await page.waitForFunction(() => (window.__gridWatch?.frames() ?? 0) > 2);
}

export type Box = { x0: number; y0: number; x1: number; y1: number };

export async function rect(page: Page, selector: string): Promise<Box | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el || (el as HTMLElement).hidden || getComputedStyle(el).display === "none" || getComputedStyle(el).visibility === "hidden") return null;
    const r = el.getBoundingClientRect();
    return r.width && r.height ? { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom } : null;
  }, selector);
}

export function overlaps(a: Box, b: Box, tolerance = 1): boolean {
  return a.x0 < b.x1 - tolerance && b.x0 < a.x1 - tolerance && a.y0 < b.y1 - tolerance && b.y0 < a.y1 - tolerance;
}

export async function islandBox(page: Page): Promise<Box> {
  return page.evaluate(() => window.__gridWatch!.islandBox());
}

export async function noHorizontalScroll(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, "page must not scroll sideways").toBeLessThanOrEqual(iw);
}

/** Copy of the example forecast, for tests that serve modified data. */
export function forecastCopy(): Forecast {
  return JSON.parse(JSON.stringify(forecast));
}
