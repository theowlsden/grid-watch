import type { Tone } from "@/lib/levels";

// "Watt", the sprout-blob mascot. Decoration only: the level is always also shown in words (spec 4.4).
const MOUTH: Record<Exclude<Tone, "unknown">, React.ReactNode> = {
  ok: <path d="M26 42q6 7 12 0" />,
  watch: <path d="M27 43q5 3.5 10 0" />,
  warn: <path d="M27 44.5h10" />,
  crit: <ellipse cx="32" cy="45" rx="3.4" ry="4.4" fill="#10312a" stroke="none" />,
};

export function Mascot({ tone }: { tone: Tone }) {
  const k = tone === "unknown" ? "watch" : tone;
  const worried = k === "warn" || k === "crit";
  return (
    <div id="mascot" aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="32" className="mascot-bg" />
        <ellipse cx="32" cy="37" rx="19" ry="17.5" fill="#5fd987" />
        <ellipse cx="25" cy="29" rx="7" ry="4" fill="#9af2b4" opacity=".7" />
        <path d="M32 21c0-6 4-9.5 10-9.5 0 6-3.5 9.5-10 9.5z" fill="#2fb86a" />
        <path d="M32 21c0-5-3-8-8.5-8 0 5 3.5 8 8.5 8z" fill="#46cf7c" />
        <circle cx="25" cy="36" r="3.2" fill="#10312a" />
        <circle cx="39" cy="36" r="3.2" fill="#10312a" />
        <circle cx="26" cy="35" r="1" fill="#fff" />
        <circle cx="40" cy="35" r="1" fill="#fff" />
        <circle cx="20" cy="42" r="3" fill="#ff9aa8" opacity=".75" />
        <circle cx="44" cy="42" r="3" fill="#ff9aa8" opacity=".75" />
        <g fill="none" stroke="#10312a" strokeWidth="2.3" strokeLinecap="round">
          {worried && <path d="M20 28l7 2.5M44 28l-7 2.5" />}
          {MOUTH[k]}
        </g>
        {k === "crit" && <path d="M50 20q4 6 0 9q-4-3 0-9z" fill="#7cc9ff" stroke="none" />}
      </svg>
    </div>
  );
}
