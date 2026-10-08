import type { Demand, Level, SiteStatus } from "./schema";

// Visual tone used by CSS classes and the scene: ok / watch / warn / crit / unknown.
export type Tone = "ok" | "watch" | "warn" | "crit" | "unknown";

// Level thresholds from spec 5.1 (keep unless calibration says otherwise).
export function levelFromIndex(index: number): Level {
  if (index < 25) return "low";
  if (index < 45) return "moderate";
  if (index < 60) return "elevated";
  return "high";
}

export const LEVEL_THRESHOLDS: { level: Level; from: number }[] = [
  { level: "moderate", from: 25 },
  { level: "elevated", from: 45 },
  { level: "high", from: 60 },
];

const TONE: Record<SiteStatus, Tone> = { low: "ok", moderate: "watch", elevated: "warn", high: "crit", unknown: "unknown" };
export const toneOf = (s: SiteStatus): Tone => TONE[s];

// Wind wording for the driver chips and stat tile (prototype thresholds, m/s at hub height).
export type WindWord = "very_low" | "light" | "steady";
export function windWord(ms: number): WindWord {
  return ms < 5.5 ? "very_low" : ms < 8 ? "light" : "steady";
}
export function windTone(ms: number): Tone {
  return ms < 5.5 ? "crit" : ms < 8 ? "warn" : "ok";
}

export function demandTone(d: Demand): Tone {
  return d === "high" ? "crit" : d === "raised" ? "warn" : "ok";
}

// Mascot expression follows the level; it is decoration only (spec 4.4).
export const toneOfLevel = (l: Level): Tone => TONE[l];
