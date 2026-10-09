// Data contracts served from /data (spec 7.1) and the sites snapshot (spec 7.4).
// JSON Schemas and a validator for these shapes live in the schemas step; the guards
// here only check enough to render safely.

export type Level = "low" | "moderate" | "elevated" | "high";
export type SiteStatus = Level | "unknown";
export type Confidence = "low" | "medium" | "high";
export type Demand = "normal" | "raised" | "high";

export interface ForecastDay {
  date: string; // YYYY-MM-DD, local date in America/Curacao
  index: number; // 0 to 100 stress index, not a probability
  level: Level;
  confidence: Confidence;
  drivers: {
    wind_ms_100m: number;
    wind_output_pct_est: number;
    temp_c: number;
    demand: Demand;
    capacity: "unknown";
  };
  sites: Record<string, { status: SiteStatus; est_output_pct?: number }>;
}

export interface Forecast {
  issued_at: string;
  timezone: string;
  data_mode: "example" | "live";
  model: { name: string; version: string; label: string };
  window_local: { start: string; end: string };
  days: ForecastDay[];
  sources: { name: string; url: string; retrieved_at: string }[];
  limitations: string[];
}

export type EventType = "blackout" | "outage" | "controlled_switching" | "shortage" | "warning";

export interface EventSource {
  publisher: string;
  title: string;
  url: string;
  published_at: string;
  retrieved_at: string;
}

export interface GridEvent {
  id: string;
  title?: string; // original language, as reported
  start_local: string; // date (YYYY-MM-DD) or local date-time with offset
  end_local: string | null;
  type: EventType;
  severity: "major" | "minor";
  drivers: string[];
  summary: string;
  sources: EventSource[];
  verified: boolean;
}

export type SiteKind = "wind" | "thermal" | "other";

export interface Site {
  slug: string;
  name_en: string;
  name_pap: string | null;
  kind: SiteKind;
  // Names of the parks at this location (e.g. Tera Kora I and II); edited in the CMS.
  // Output is never split by park (spec 12.6).
  parks: string[] | null;
  lat: number | null;
  lon: number | null;
  placement: "exact" | "approximate";
  enabled: boolean;
  sortOrder: number;
  description_en: string | null;
  description_pap: string | null;
  source_note: string | null;
  // Nudge for the 3D model in metres east/north and its turn in degrees; the real
  // coordinate stays where it is (spec 7.4).
  modelOffset?: [number, number] | null;
  modelRotation?: number | null;
  // Stylised scene position, used only when there is no island outline (spec 7.4).
  placeholder_uv: [number, number] | null;
}

export interface GeoPolygon {
  type: "Polygon";
  coordinates: [number, number][][]; // one closed exterior ring of [lon, lat]
}

export interface Island {
  version: string;
  outline: GeoPolygon | null;
  anchorLat: number | null;
  anchorLon: number | null;
  metresPerUnit: number | null;
  rotation: number;
  source?: { name: string; licence: string; url?: string; retrieved_at: string } | null;
}

export interface SitesSnapshot {
  island: Island;
  sites: Site[];
}

const LEVELS = ["low", "moderate", "elevated", "high"];

export function isForecast(x: unknown): x is Forecast {
  const f = x as Forecast;
  return (
    !!f &&
    (f.data_mode === "example" || f.data_mode === "live") &&
    Array.isArray(f.days) &&
    f.days.length > 0 &&
    f.days.every((d) => typeof d.date === "string" && typeof d.index === "number" && LEVELS.includes(d.level))
  );
}

export function isEventList(x: unknown): x is GridEvent[] {
  return Array.isArray(x) && x.every((e) => e && typeof e.id === "string" && typeof e.start_local === "string");
}
