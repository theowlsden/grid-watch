"use client";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Forecast, GridEvent } from "@/lib/schema";
import { loadEvents, loadForecast, snapshotSites } from "@/lib/data";
import { getModePref, resolveMode, setModePref, subscribeModePref, type ModePref } from "@/lib/mode";
import { siteView, warnUnknownSlugs } from "@/lib/view";
import { LOCALE, translator, type Lang } from "@/i18n";
import { EventsList } from "./EventsList";
import { IslandStage, type StageSite } from "./IslandStage";
import { ModeSwitch } from "./ModeSwitch";
import { RiskCard } from "./RiskCard";
import { SiteCard } from "./SiteCard";
import { StatTiles } from "./StatTiles";
import { WeekChart } from "./WeekChart";
import { DayStrip } from "./DayStrip";

const SITES = snapshotSites();
const noop = () => () => {};

export function Dashboard() {
  const lang: Lang = "en"; // EN / PAP toggle comes with the language step
  const t = useMemo(() => translator(lang), [lang]);
  const locale = LOCALE[lang];

  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [events, setEvents] = useState<GridEvent[]>([]);
  const [failed, setFailed] = useState(false);
  const [dayIdx, setDayIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [picked, setPicked] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const pref = useSyncExternalStore(subscribeModePref, getModePref, () => "auto" as ModePref);
  // false while hydrating the static HTML: mode-init.js already set data-mode before paint
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const [now, setNow] = useState(() => Date.now());
  const mode = resolveMode(pref, new Date(now));

  useEffect(() => {
    const ac = new AbortController();
    loadForecast(ac.signal)
      .then(setForecast)
      .catch((e) => {
        if (!ac.signal.aborted) {
          console.error(e);
          setFailed(true);
        }
      });
    loadEvents(ac.signal).then(setEvents);
    return () => ac.abort();
  }, []);

  // Day / night: Auto re-evaluates every 60 s (spec 4.3).
  useEffect(() => {
    if (pref !== "auto") return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [pref]);
  useEffect(() => {
    if (hydrated) document.documentElement.setAttribute("data-mode", mode);
  }, [mode, hydrated]);
  const changePref = (p: ModePref) => setModePref(p);

  const select = useCallback((slug: string | null) => {
    setSelected(slug);
    if (slug) setPicked(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        setEventsOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const day = forecast?.days[Math.min(dayIdx, forecast.days.length - 1)] ?? null;
  useEffect(() => {
    if (day) warnUnknownSlugs(day, SITES);
  }, [day]);

  const stageSites: StageSite[] = SITES.map((s) => {
    const v = day ? siteView(s, day) : null;
    const meta = !v ? "" : s.kind === "wind" ? (v.hasData ? t("site.meta.wind", { pct: v.estOutputPct ?? 0 }) : t("site.noData")) : t("site.meta.thermal");
    return {
      slug: s.slug,
      name: (lang !== "en" && s.name_pap) || s.name_en,
      meta,
      tone: v?.tone ?? "unknown",
      scene: { slug: s.slug, kind: s.kind, uv: s.placeholder_uv ?? [0, 0], parkCount: s.park_count },
    };
  });
  const site = SITES.find((s) => s.slug === selected);
  const card =
    site && forecast && day ? (
      <SiteCard site={site} name={stageSites.find((x) => x.slug === site.slug)!.name} forecast={forecast} day={day} locale={locale} t={t} onClose={() => select(null)} />
    ) : null;

  const example = forecast?.data_mode === "example";
  const appClass = [selected && "sheet-open", picked && "picked", !webgl && "no-webgl"].filter(Boolean).join(" ");

  return (
    <div id="app" className={appClass}>
      <IslandStage
        sites={stageSites}
        windMs={day?.drivers.wind_ms_100m ?? 0}
        selected={selected}
        onSelect={select}
        night={mode === "night"}
        card={card}
        onWebgl={setWebgl}
        t={t}
      />

      <div id="below">
        {forecast && <WeekChart days={forecast.days} selected={dayIdx} onSelect={setDayIdx} locale={locale} t={t} />}
        <section id="evCard" className="card">
          <EventsList events={events} locale={locale} t={t} />
        </section>
      </div>

      <div id="side">
        <section id="brand" className="card">
          <div className="brow">
            {example && <span className="tag">{t("tag.example")}</span>}
            <ModeSwitch pref={pref} onChange={changePref} t={t} />
          </div>
          <h1>{t("app.name")}</h1>
          <p className="sub">{t("app.tagline")}</p>
          <p className="disc">{t("app.disclaimer")}</p>
          <p className="credit">{t("app.credit")}</p>
        </section>
        {forecast && day ? (
          <>
            <RiskCard forecast={forecast} day={day} locale={locale} t={t} />
            <StatTiles day={day} t={t} />
          </>
        ) : (
          <section id="hud" className="card" aria-live="polite">
            <p className="sub">{failed ? t("app.loadError") : t("app.loading")}</p>
          </section>
        )}
      </div>

      <header id="topbar" className="card">
        <div className="appname">
          <span className="nm">{t("app.name")}</span>
          <span className="disc">{t("app.disclaimer")}</span>
        </div>
        <button id="evBtn" type="button" aria-expanded={eventsOpen} aria-controls="events" onClick={() => setEventsOpen((o) => !o)}>
          {t("events.button")}
        </button>
        <div id="mseg">
          <ModeSwitch pref={pref} onChange={changePref} t={t} />
        </div>
      </header>
      <aside id="events" className="card" hidden={!eventsOpen} aria-label={t("events.title")}>
        <EventsList events={events} locale={locale} t={t} />
        <p className="credit">{t("app.credit")}</p>
      </aside>

      {forecast && <DayStrip days={forecast.days} selected={dayIdx} onSelect={setDayIdx} locale={locale} t={t} />}
    </div>
  );
}
