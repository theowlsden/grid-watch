import { LANGS, type Lang, type Translate } from "@/i18n";

// EN / PAP toggle next to Auto / Day / Night (spec 4.7).
export function LangSwitch({ lang, onChange, t }: { lang: Lang; onChange: (l: Lang) => void; t: Translate }) {
  return (
    <div className="seg lang" role="group" aria-label={t("lang.group")}>
      {LANGS.map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={lang === l} aria-label={t(`lang.name.${l}`)} onClick={() => onChange(l)}>
          {t(`lang.short.${l}`)}
        </button>
      ))}
    </div>
  );
}
