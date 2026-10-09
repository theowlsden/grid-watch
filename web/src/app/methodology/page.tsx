import type { Metadata } from "next";
import Link from "next/link";
import { LANGS, translator, type Lang } from "@/i18n";
import { readStressConfig } from "@/lib/model";

export const metadata: Metadata = {
  title: "How Grid Watch works",
  description: "The rules, inputs and limits behind the Grid Watch Curaçao stress outlook.",
};

const REPO = "https://github.com/theowlsden/grid-watch";

// Methodology and limits (spec 8.2). Numbers come from pipeline/stress_config.yaml at build time.
// The static page holds every language; CSS shows the one matching <html lang>, which
// mode-init.js sets from the visitor's choice before first paint.
export default function Methodology() {
  const c = readStressConfig();
  return (
    <div className="doc-page">
      {LANGS.map((lang) => (
        <Body key={lang} lang={lang} c={c} />
      ))}
    </div>
  );
}

function Body({ lang, c }: { lang: Lang; c: ReturnType<typeof readStressConfig> }) {
  const t = translator(lang);
  const pct = (v: number) => Math.round(v * 100);
  return (
    <>
      <main className="doc" lang={lang} data-doc-lang={lang}>
        <p>
          <Link href="/">← {t("method.back")}</Link>
        </p>
        <h1>{t("method.title")}</h1>
        <p className="lead">{t("method.intro")}</p>

        <h2>{t("method.number.h")}</h2>
        <p>{t("method.number.p", { name: c.name, version: c.version, ...c.levels })}</p>

        <h2>{t("method.inputs.h")}</h2>
        <p>
          {t("method.inputs.p", {
            start: c.window_local.start,
            end: c.window_local.end,
            days: c.days,
            provider: c.source.provider === "open-meteo" ? "Open-Meteo" : c.source.provider,
            model: c.source.model === "ecmwf_ifs025" ? "ECMWF IFS 0.25°" : c.source.model,
            ensemble: c.source.ensemble_model === "ecmwf_ifs025" ? "ECMWF IFS, 51 members" : c.source.ensemble_model,
          })}
        </p>

        <h2>{t("method.rules.h")}</h2>
        <ul>
          <li>{t("method.rules.wind", { cutIn: c.power_curve.cut_in_ms, rated: c.power_curve.rated_ms, cutOut: c.power_curve.cut_out_ms })}</li>
          <li>{t("method.rules.windStress", { noStress: pct(c.wind_stress.no_stress_at_output) })}</li>
          <li>
            {t("method.rules.demand", {
              low: c.demand.heat_index_low_c,
              high: c.demand.heat_index_high_c,
              raised: c.demand.raised_from,
              highFrom: c.demand.high_from,
            })}
          </li>
          <li>{t("method.rules.index", { wWind: c.weights.wind, wDemand: c.weights.demand })}</li>
          <li>{t("method.rules.sites", { highBelow: c.site_status.high_below, elevatedBelow: c.site_status.elevated_below })}</li>
          <li>{t("method.rules.confidence", { medium: c.confidence.medium_until_day, spread: c.confidence.spread_downgrade_ms })}</li>
        </ul>

        <h2>{t("method.gaps.h")}</h2>
        <p>{t("method.gaps.p")}</p>

        <h2>{t("method.record.h")}</h2>
        <p>{t("method.record.p", { hours: c.stale_after_hours })}</p>

        <h2>{t("method.limits.h")}</h2>
        <p>{t("method.limits.p")}</p>

        <h2>{t("method.sources.h")}</h2>
        <p>
          {t("method.sources.p")}{" "}
          <a href={`${REPO}/blob/main/DATA_LICENSES.md`} target="_blank" rel="noopener noreferrer">
            {t("method.sources.link")}
          </a>
        </p>

        <h2>{t("method.news.h")}</h2>
        <p>{t("method.news.p")}</p>

        <h2>{t("method.contact.h")}</h2>
        <p>
          {t("method.contact.p")}{" "}
          <a href={`${REPO}/issues/new/choose`} target="_blank" rel="noopener noreferrer">
            {t("method.contact.link")}
          </a>
        </p>

        <p className="credit">{t("app.credit")}</p>
      </main>
    </>
  );
}
