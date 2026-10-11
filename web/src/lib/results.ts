// The backtest report (spec 5.3), written by pipeline/tools/run_backtest.py and bundled at build
// time. Retrospective numbers only; the results page shows them once RESULTS_ENABLED is on.
import data from "../../../data/backtests/rules-v0-gfs.json";

export interface Caveat {
  id: string;
  [param: string]: string | number;
}

export interface ErrorRow {
  lead_h_from: number;
  lead_h_to: number;
  n: number;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
}

export interface Confusion {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number | null;
  recall: number | null;
  fpr: number | null;
}

export interface MethodScores {
  brier: { n: number; brier: number | null };
  thresholds: Record<string, Confusion>;
}

export interface Report {
  generated_at: string;
  rules: { name: string; version: string };
  hindcasts: { source: { name: string; url: string } | null; first: string; last: string; count: number };
  events: { sourced: number; unsourced_excluded: number; coverage: [string, string] };
  caveats: Caveat[];
  weather_error: { wind_ms_10m: ErrorRow[]; temp_c: ErrorRow[] };
  level_frequency: { month: string; low: number; moderate: number; elevated: number; high: number }[];
  detection: {
    event_evenings: number;
    evenings: number;
    by_lead_days: Record<string, { n: number; event_evenings: number; methods: Record<string, MethodScores> }>;
    calibration: { index_from: number; index_to: number; n: number; event_evenings: number; observed_rate: number | null }[];
    warning_times: { event: string; threshold: number; first_issue: string | null; hours_ahead: number | null }[];
  };
  case_studies: { event: string; start_local: string; type: string; rows: { at: string; issued_at: string | null; index: number | null; level: string | null }[] }[];
}

export const REPORT = data as unknown as Report;
export const METHODS = ["rules", "wind_only", "persistence", "seasonal", "base_rate"] as const;

/** A number for a table cell: fixed decimals, a dash when missing. */
export function num(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined ? "–" : v.toFixed(digits);
}

/** Signed, for biases: "+2.6", "-1.6". */
export function signed(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;
}
