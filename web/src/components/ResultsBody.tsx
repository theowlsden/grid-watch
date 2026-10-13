"use client";
import Link from "next/link";
import { DocLangSwitch } from "./DocLangSwitch";
import { useEffect, useState } from "react";
import { coverage, type Lang, type MessageKey, type Translate } from "@/i18n";
import { useTranslator } from "@/i18n/use";
import { runtimeConfig } from "@/lib/config";
import { METHODS, num, REPORT, signed, type Caveat, type Report } from "@/lib/results";
import { dateMedium } from "@/lib/time";

const REPO = "https://github.com/theowlsden/grid-watch";
const LEVELS = ["low", "moderate", "elevated", "high"] as const;
// the rules at three index thresholds, the baselines at their single cut; the full set of
// thresholds (30 to 80) is in docs/results.md
const SHOWN = (m: string) => (m === "rules" || m === "wind_only" ? ["40", "50", "60"] : ["50"]);

function caveat(c: Caveat, t: Translate): string {
  const vars: Record<string, string | number> = { ...c };
  if (c.id === "place_bias") {
    vars.wind = signed(Number(c.wind));
    vars.temp = signed(Number(c.temp));
  }
  return t(`results.caveat.${c.id}` as MessageKey, vars);
}

/** One month's evenings as a stacked bar; the counts are in the table next to it. */
function LevelBar({ counts }: { counts: Record<(typeof LEVELS)[number], number> }) {
  const total = LEVELS.reduce((s, l) => s + counts[l], 0) || 1;
  const widths = LEVELS.map((l) => (100 * counts[l]) / total);
  const starts = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <svg className="lvbar" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
      {LEVELS.map((l, i) => (
        <rect key={l} className={`lv-${l}`} x={starts[i]} y={0} width={widths[i]} height={10} />
      ))}
    </svg>
  );
}

function Weather({ r, t }: { r: Report; t: Translate }) {
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th rowSpan={2}>{t("results.weather.horizon")}</th>
            <th colSpan={4}>{t("results.weather.wind")}</th>
            <th colSpan={4}>{t("results.weather.temp")}</th>
          </tr>
          <tr>
            {[0, 1].flatMap((k) =>
              (["n", "mae", "rmse", "bias"] as const).map((c) => <th key={`${k}${c}`}>{t(`results.weather.${c}`)}</th>),
            )}
          </tr>
        </thead>
        <tbody>
          {r.weather_error.wind_ms_10m.map((w, i) => {
            const tp = r.weather_error.temp_c[i];
            return (
              <tr key={w.lead_h_from}>
                <th scope="row">
                  {w.lead_h_from}–{w.lead_h_to}
                </th>
                {[w, tp].flatMap((row, k) => [
                  <td key={`${k}n`}>{row.n}</td>,
                  <td key={`${k}m`}>{num(row.mae)}</td>,
                  <td key={`${k}r`}>{num(row.rmse)}</td>,
                  <td key={`${k}b`}>{signed(row.bias, 2)}</td>,
                ])}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Levels({ r, t }: { r: Report; t: Translate }) {
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>{t("results.levels.month")}</th>
            {LEVELS.map((l) => (
              <th key={l}>{t(`level.${l}`)}</th>
            ))}
            <th className="barhead" aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {r.level_frequency.map((m) => (
            <tr key={m.month}>
              <th scope="row">{m.month}</th>
              {LEVELS.map((l) => (
                <td key={l}>{m[l]}</td>
              ))}
              <td className="barcell">
                <LevelBar counts={m} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Detection({ r, t }: { r: Report; t: Translate }) {
  const d = r.detection;
  if (!d.event_evenings) return <p>{t("results.detection.none")}</p>;
  return (
    <>
      <p>{t("results.detection.summary", { events: d.event_evenings, evenings: d.evenings })}</p>
      {["0", "1", "2", "3"].map((lead) => {
        const b = d.by_lead_days[lead];
        if (!b) return null;
        return (
          <section key={lead}>
            <h3>
              {lead === "0" ? t("results.detection.same") : t("results.detection.ahead", { n: lead })} ·{" "}
              {t("results.detection.outlooks", { n: b.n, events: b.event_evenings })}
            </h3>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    {(["method", "brier", "at", "precision", "recall", "fpr"] as const).map((c) => (
                      <th key={c}>{t(`results.detection.${c}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {METHODS.flatMap((m) =>
                    SHOWN(m)
                      .map((th) => [th, b.methods[m].thresholds[th]] as const)
                      .filter(([, c]) => c)
                      .map(([th, c]) => (
                        <tr key={`${m}${th}`}>
                          <th scope="row">{t(`results.method.${m}`)}</th>
                          <td>{num(b.methods[m].brier.brier, 3)}</td>
                          <td>≥ {th}</td>
                          <td>{num(c.precision)}</td>
                          <td>{num(c.recall)}</td>
                          <td>{num(c.fpr)}</td>
                        </tr>
                      )),
                  )}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      <h3>{t("results.calibration.h")}</h3>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {(["index", "n", "events", "share"] as const).map((c) => (
                <th key={c}>{t(`results.calibration.${c}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.calibration.map((c) => (
              <tr key={c.index_from}>
                <th scope="row">
                  {c.index_from}–{c.index_to}
                </th>
                <td>{c.n}</td>
                <td>{c.event_evenings}</td>
                <td>{num(c.observed_rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>{t("results.warning.h")}</h3>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {(["event", "threshold", "first", "hours"] as const).map((c) => (
                <th key={c}>{t(`results.warning.${c}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.warning_times.map((w) => (
              <tr key={`${w.event}${w.threshold}`}>
                <th scope="row">{w.event}</th>
                <td>{w.threshold}</td>
                <td>{w.first_issue ?? t("results.warning.never")}</td>
                <td>{num(w.hours_ahead, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Cases({ r, t }: { r: Report; t: Translate }) {
  if (!r.case_studies.length) return null;
  return (
    <>
      <h2>{t("results.cases.h")}</h2>
      {r.case_studies.map((cs) => (
        <section key={cs.event}>
          <h3>{cs.event}</h3>
          <p>{t("results.cases.p")}</p>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>{t("results.cases.when")}</th>
                  <th>{t("results.cases.issue")}</th>
                  <th>{t("results.calibration.index")}</th>
                  <th>{t("results.cases.level")}</th>
                </tr>
              </thead>
              <tbody>
                {cs.rows.map((row) => (
                  <tr key={row.at}>
                    <th scope="row">{row.at}</th>
                    <td>{row.issued_at ?? t("results.cases.none")}</td>
                    <td>{num(row.index, 0)}</td>
                    <td>{row.level ? t(`level.${row.level}` as MessageKey) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}

export function ResultsBody({ lang }: { lang: Lang }) {
  const { t, dates } = useTranslator(lang);
  // null while the runtime config loads
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    runtimeConfig().then((c) => setOn(c.results));
  }, []);
  const r = REPORT;
  return (
    <main className="doc results" lang={lang} data-doc-lang={lang}>
      <div className="doc-top">
        <Link href="/">← {t("method.back")}</Link>
        <DocLangSwitch t={t} />
      </div>
      <h1>{t("results.title")}</h1>
      {on === null && <p className="lead">{t("results.loading")}</p>}
      {on === false && <p className="lead">{t("results.off")}</p>}
      {on && (
        <>
          {lang !== "en" && coverage(lang, "results.") < 0.95 && <p className="sub">{t("results.papPending")}</p>}
          <p className="lead">
            {t("results.intro", {
              first: dateMedium(r.hindcasts.first.slice(0, 10), dates),
              last: dateMedium(r.hindcasts.last.slice(0, 10), dates),
              count: r.hindcasts.count,
              name: r.rules.name,
              version: r.rules.version,
              source: r.hindcasts.source?.name ?? "NOAA GFS",
            })}
          </p>

          <h2>{t("results.caveats.h")}</h2>
          <ul>
            {r.caveats.map((c) => (
              <li key={c.id}>{caveat(c, t)}</li>
            ))}
          </ul>

          <h2>{t("results.detection.h")}</h2>
          <Detection r={r} t={t} />
          <Cases r={r} t={t} />

          <h2>{t("results.weather.h")}</h2>
          <p>{t("results.weather.p")}</p>
          <Weather r={r} t={t} />

          <h2>{t("results.levels.h")}</h2>
          <p>{t("results.levels.p")}</p>
          <Levels r={r} t={t} />

          <p>{t("results.demand.p")}</p>
          <p>
            {t("results.sources.p")}{" "}
            <a href={`${REPO}/blob/main/docs/results.md`} target="_blank" rel="noopener noreferrer">
              {t("results.sources.link")}
            </a>
          </p>
          <p className="credit">
            {t("results.generated", { time: r.generated_at.slice(0, 16).replace("T", " ") })} {t("app.credit")}
          </p>
        </>
      )}
    </main>
  );
}
