import type { Tone } from "@/lib/levels";

// The risk card's face: a system emoji, so each device draws it in its own style (Apple's on
// iPhone and Mac, Google's on Android, Microsoft's on Windows). Decoration only: the level is
// always also shown in words (spec 4.4).
const FACE: Record<Tone, string> = {
  ok: "😊", // smiling face with smiling eyes
  watch: "🙂", // slightly smiling face
  warn: "😟", // worried face
  crit: "😰", // anxious face with sweat
  unknown: "😶", // face without mouth: not public, or out of date
};

export function Mascot({ tone }: { tone: Tone }) {
  return (
    <div id="mascot" aria-hidden="true">
      <span className="face">{FACE[tone]}</span>
    </div>
  );
}
