import type { ForecastDay, Site, SiteStatus } from "./schema";
import { toneOf, windWord, type Tone } from "./levels";

// How one site looks on a given day (spec 5.2 step 6 and 7.4 "Forecast keys").
export interface SiteView {
  status: SiteStatus;
  tone: Tone;
  hasData: boolean;
  estOutputPct: number | null;
}

export function siteView(site: Site, day: ForecastDay): SiteView {
  // Conventional generation: availability is not public, so it is always "unknown".
  if (site.kind !== "wind") return { status: "unknown", tone: "unknown", hasData: true, estOutputPct: null };
  const s = day.sites[site.slug];
  if (!s) return { status: "unknown", tone: "unknown", hasData: false, estOutputPct: null };
  return { status: s.status, tone: toneOf(s.status), hasData: true, estOutputPct: s.est_output_pct ?? day.drivers.wind_output_pct_est };
}

export function windWordOf(day: ForecastDay) {
  return windWord(day.drivers.wind_ms_100m);
}

// Statuses for unknown slugs are ignored and, in development, logged (spec 7.4).
export function warnUnknownSlugs(day: ForecastDay, sites: Site[]): void {
  if (process.env.NODE_ENV === "production") return;
  const known = new Set(sites.map((s) => s.slug));
  for (const slug of Object.keys(day.sites)) {
    if (!known.has(slug)) console.warn(`[grid-watch] forecast status for unknown site "${slug}" ignored`);
  }
}
