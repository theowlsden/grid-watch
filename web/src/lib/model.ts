// The stress rules as configured for the pipeline (pipeline/stress_config.yaml), read at build
// time so the methodology page always shows the numbers the pipeline actually uses.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

export interface StressConfig {
  name: string;
  version: string;
  window_local: { start: string; end: string };
  days: number;
  source: { provider: string; model: string; ensemble_model: string };
  power_curve: { cut_in_ms: number; rated_ms: number; cut_out_ms: number };
  demand: { heat_index_low_c: number; heat_index_high_c: number; raised_from: number; high_from: number };
  weights: { wind: number; demand: number };
  wind_stress: { no_stress_at_output: number };
  levels: { moderate: number; elevated: number; high: number };
  site_status: { high_below: number; elevated_below: number };
  confidence: { high_until_day: number; medium_until_day: number; spread_downgrade_ms: number };
  stale_after_hours: number;
}

export function readStressConfig(): StressConfig {
  return parse(readFileSync(join(process.cwd(), "..", "pipeline", "stress_config.yaml"), "utf8")) as StressConfig;
}
