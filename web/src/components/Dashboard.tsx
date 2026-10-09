"use client";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Forecast, GridEvent } from "@/lib/schema";
import { loadCmsIsland, loadCmsSites, loadEvents, loadForecast, snapshotIsland, snapshotSites, validOutline } from "@/lib/data";
import { northAngle, project, projectWithOffset, type IslandGeo } from "@/lib/projection";
import { stylisedXZ, type SceneIsland } from "@/scene/IslandScene";
import { loadConfig } from "@/lib/config";
import { loadNews, readDismissed, storeDismissed, type NewsItem } from "@/lib/news";
import type { Island, Site } from "@/lib/schema";
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
import { News } from "./News";

const SNAPSHOT_SITES = snapshotSites();
const SNAPSHOT_ISLAND = snapshotIsland();

/** Projection parameters when the island has a real outline, otherwise null (stylised island). */
function islandGeo(island: Island): IslandGeo | null {
  if (!validOutline(island.outline) || island.anchorLat === null || island.anchorLon === null || !island.metresPerUnit) return null;
  return { anchorLat: island.anchorLat, anchorLon: island.anchorLon, metresPerUnit: island.metresPerUnit, rotation: island.rotation ?? 0 };
}
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
  const [sites, setSites] = useState<Site[]>(SNAPSHOT_SITES);
  const [island, setIsland] = useState<Island>(SNAPSHOT_ISLAND);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
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
    // CMS content is optional: news and site records load in the background and the page
    // never waits for them (spec 7.3, 7.4)
    loadConfig(ac.signal).then(({ cmsOrigin }) => {
      loadNews(cmsOrigin, ac.signal).then((n) => {
        if (ac.signal.aborted) return;
        setDismissed(readDismissed());
        setNews(n);
      });
      loadCmsSites(cmsOrigin, ac.signal).then((s) => {
        if (s && !ac.signal.aborted) setSites(s);
      });
      loadCmsIsland(cmsOrigin, ac.signal).then((i) => {
        if (i && !ac.signal.aborted) setIsland(i);
      });
    });
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
    if (day) warnUnknownSlugs(day, sites);
  }, [day, sites]);
  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    storeDismissed(next);
  };
  const visibleNews = news.filter((n) => !dismissed.includes(n.id));

  // One projection for the outline and the sites (spec 7.4). Without an outline the scene uses
  // the stylised island and each site's placeholder position.
  const geo = islandGeo(island);
  const sceneIsland: SceneIsland = useMemo(
    () => ({
      coast: geo ? island.outline!.coordinates[0].slice(0, -1).map(([lon, lat]) => project(lat, lon, geo)) : null,
      north: geo ? northAngle(geo) : 0,
    }),
    // geo is derived from island
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [island],
  );
  const placed = sites.filter((s) => (geo ? s.lat !== null && s.lon !== null : !!s.placeholder_uv));
  const stageSites: StageSite[] = placed.map((s) => {
    const v = day ? siteView(s, day) : null;
    const meta = !v ? "" : s.kind === "wind" ? (v.hasData ? t("site.meta.wind", { pct: v.estOutputPct ?? 0 }) : t("site.noData")) : t("site.meta.thermal");
    return {
      slug: s.slug,
      name: (lang !== "en" && s.name_pap) || s.name_en,
      meta,
      tone: v?.tone ?? "unknown",
      scene: {
        slug: s.slug,
        kind: s.kind,
        xz: geo ? projectWithOffset(s.lat!, s.lon!, geo, s.modelOffset ?? null) : stylisedXZ(...s.placeholder_uv!),
        parkCount: Math.max(1, s.parks?.length ?? 1),
        rotationDeg: s.modelRotation ?? null,
      },
    };
  });
  const site = sites.find((s) => s.slug === selected);
  const card =
    site && forecast && day ? (
      <SiteCard site={site} name={stageSites.find((x) => x.slug === site.slug)!.name} forecast={forecast} day={day} locale={locale} t={t} onClose={() => select(null)} />
    ) : null;

  const example = forecast?.data_mode === "example";
  const appClass = [selected && "sheet-open", picked && "picked", !webgl && "no-webgl", visibleNews.length && "has-news"].filter(Boolean).join(" ");
  // the scene is built once per site list; a different list from the CMS rebuilds it
  const sceneKey =
    `${island.version}|` + stageSites.map((s) => `${s.slug}:${s.scene.kind}:${s.scene.xz.map((v) => v.toFixed(3)).join("/")}:${s.scene.parkCount}:${s.scene.rotationDeg ?? 0}`).join("|");

  return (
    <div id="app" className={appClass}>
      <IslandStage
        key={sceneKey}
        sites={stageSites}
        island={sceneIsland}
        mapCredit={geo ? { text: t("map.credit"), url: island.source?.url ?? "https://www.openstreetmap.org/copyright" } : null}
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
            <News items={visibleNews} lang={lang} locale={locale} onDismiss={dismiss} t={t} />
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
