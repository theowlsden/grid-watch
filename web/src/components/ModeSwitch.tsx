import type { ModePref } from "@/lib/mode";
import type { Translate } from "@/i18n";

const PREFS: ModePref[] = ["auto", "day", "night"];

export function ModeSwitch({ pref, onChange, t }: { pref: ModePref; onChange: (p: ModePref) => void; t: Translate }) {
  return (
    <div className="seg" role="group" aria-label={t("mode.group")}>
      {PREFS.map((p) => (
        <button key={p} type="button" aria-pressed={pref === p} onClick={() => onChange(p)}>
          {t(`mode.${p}`)}
        </button>
      ))}
    </div>
  );
}
