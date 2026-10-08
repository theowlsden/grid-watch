// Day / night appearance (spec 4.3). Mode changes appearance only, never data.
// public/mode-init.js applies the same rule before first paint; keep the two in step.

export type ModePref = "auto" | "day" | "night";
export type Mode = "day" | "night";

export const MODE_KEY = "gridwatch-mode";

// Auto follows the viewer's local clock: day from 06:00 to 18:00, night otherwise.
export function autoMode(now: Date = new Date()): Mode {
  const h = now.getHours();
  return h >= 6 && h < 18 ? "day" : "night";
}

export function resolveMode(pref: ModePref, now: Date = new Date()): Mode {
  return pref === "auto" ? autoMode(now) : pref;
}

// The stored choice, as a tiny external store for useSyncExternalStore. Works without
// localStorage (private mode, blocked storage): the choice then lasts for this visit only.
let memory: ModePref | null = null;
const listeners = new Set<() => void>();

export function getModePref(): ModePref {
  if (memory) return memory;
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === "auto" || v === "day" || v === "night") return v;
  } catch {
    // storage blocked
  }
  return "auto";
}

export function setModePref(pref: ModePref): void {
  memory = pref;
  try {
    localStorage.setItem(MODE_KEY, pref);
  } catch {
    // storage blocked
  }
  listeners.forEach((l) => l());
}

export function subscribeModePref(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
