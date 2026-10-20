import type { Tone } from "@/lib/levels";
import { LEVEL_THRESHOLDS } from "@/lib/levels";

// Half-circle gauge for the 0 to 100 stress index (decoration: the number and the level word
// are always shown beside it). Bands follow the level thresholds; the band the needle is in is
// drawn at full strength, the needle takes the level's colour. SVG attributes only: the CSP
// allows no inline styles.
const CX = 50, CY = 50, R = 40;

function point(value: number, r = R): [number, number] {
  const a = Math.PI - (Math.max(0, Math.min(100, value)) / 100) * Math.PI;
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
}

function arc(from: number, to: number): string {
  const [x0, y0] = point(from);
  const [x1, y1] = point(to);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

const BAND_TONE: Tone[] = ["ok", "watch", "warn", "crit"];

/** The gauge with the index (children) set under its needle. */
export function Gauge({ index, tone, children }: { index: number; tone: Tone; children: React.ReactNode }) {
  const edges = [0, ...LEVEL_THRESHOLDS.map((l) => l.from), 100];
  const [nx, ny] = point(index, R - 6);
  return (
    <span className="gauge-box">
      <svg className="gauge" viewBox="0 0 100 56" aria-hidden="true">
      {BAND_TONE.map((bt, i) => (
        <path key={bt} d={arc(edges[i] + (i ? 0.8 : 0), edges[i + 1] - (i < 3 ? 0.8 : 0))} className={`band t-${bt}${bt === tone ? " on" : ""}`} />
      ))}
      <line x1={CX} y1={CY} x2={nx.toFixed(2)} y2={ny.toFixed(2)} className={`needle t-${tone}`} />
      <circle cx={CX} cy={CY} r={5} className="hub" />
      </svg>
      {children}
    </span>
  );
}
