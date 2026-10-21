"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MessageKey } from "@/i18n";
import { useI18n } from "@/i18n/use";
import { runtimeConfig } from "@/lib/config";
import places from "../../../data/neighbourhoods.json";
import { DocLangSwitch } from "./DocLangSwitch";

// Public report form (decision 26). Sourced reports go to an editor, who turns them into events
// or notices; unsourced community reports are only ever shown as grouped counts. No names or
// contact details are asked. Cloudflare Turnstile keeps bots out (the CMS checks the token), and
// a hidden "website" field catches the simple ones. Closed until TURNSTILE_SITEKEY is set.

const NAMES: string[] = (places as { neighbourhoods: { name: string }[] }).neighbourhoods.map((n) => n.name);
const KNOWN = new Map(NAMES.map((n) => [n.toLowerCase(), n]));
const TYPES = ["load_shedding", "outage", "blackout", "shortage", "notice", "other"] as const;
const FIRST_DATE = "2025-01-01";
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (el: HTMLElement, o: Record<string, unknown>) => string;
  reset: (id?: string) => void;
}

const localToday = () => new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);

export function ReportForm() {
  const { lang, t } = useI18n();
  const [cfg, setCfg] = useState<{ cms: string; sitekey: string } | null>(null);
  const [kind, setKind] = useState<"community" | "sourced">("community");
  const [type, setType] = useState<(typeof TYPES)[number]>("load_shedding");
  const [date, setDate] = useState(localToday);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [ongoing, setOngoing] = useState(false);
  const [scope, setScope] = useState<"island" | "areas" | "unknown">("areas");
  const [areas, setAreas] = useState<string[]>([]);
  const [pick, setPick] = useState("");
  const [pickError, setPickError] = useState(false);
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [honey, setHoney] = useState("");
  const [token, setToken] = useState("");
  const [state, setState] = useState<{ s: "idle" | "sending" | "done" | "error"; msg?: string }>({ s: "idle" });
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    runtimeConfig().then((c) => setCfg({ cms: c.cmsOrigin, sitekey: c.cmsOrigin ? c.turnstile : "" }));
  }, []);

  // the Turnstile widget, once there is a key and the form is showing
  useEffect(() => {
    if (!cfg?.sitekey || state.s === "done" || !widget.current) return;
    const el = widget.current;
    const draw = () => {
      const ts = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (!ts || widgetId.current) return;
      widgetId.current = ts.render(el, {
        sitekey: cfg.sitekey,
        language: lang === "pap" ? "nl" : "en", // Turnstile has no Papiamentu
        callback: (tk: string) => setToken(tk),
        "expired-callback": () => setToken(""),
        "error-callback": () => setToken(""),
      });
    };
    if ((window as unknown as { turnstile?: TurnstileApi }).turnstile) draw();
    else if (!document.querySelector(`script[src="${SCRIPT}"]`)) {
      const s = document.createElement("script");
      s.src = SCRIPT;
      s.async = true;
      s.onload = draw;
      document.head.appendChild(s);
    } else document.querySelector(`script[src="${SCRIPT}"]`)!.addEventListener("load", draw);
    return () => {
      widgetId.current = null;
      el.replaceChildren();
    };
  }, [cfg, state.s, lang]);

  const addArea = () => {
    const name = KNOWN.get(pick.trim().toLowerCase());
    if (!name) {
      setPickError(true);
      return;
    }
    setPickError(false);
    if (!areas.includes(name)) setAreas([...areas, name]);
    setPick("");
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!cfg) return;
    if (!token) {
      setState({ s: "error", msg: t("report.needCheck") });
      return;
    }
    setState({ s: "sending" });
    const body = {
      kind,
      type: kind === "community" && type === "notice" ? "other" : type,
      date,
      start_time: start,
      end_time: ongoing ? "" : end,
      ongoing,
      scope,
      areas: scope === "areas" ? areas : [],
      source_url: source.trim(),
      note: note.trim(),
      website: honey,
      "cf-turnstile-response": token,
    };
    try {
      const res = await fetch(`${cfg.cms}/api/collections/reports/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "omit",
      });
      if (!res.ok) {
        const msg = ((await res.json().catch(() => ({}))) as { message?: string }).message || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setState({ s: "done" });
    } catch (e) {
      setState({ s: "error", msg: t("report.failed", { reason: (e as Error).message }) });
      const ts = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (ts && widgetId.current) ts.reset(widgetId.current);
      setToken("");
    }
  };

  const restart = () => {
    setStart("");
    setEnd("");
    setOngoing(false);
    setAreas([]);
    setSource("");
    setNote("");
    setToken("");
    setState({ s: "idle" });
  };

  return (
    <main className="doc report" lang={lang}>
      <div className="doc-top">
        <Link href="/">← {t("method.back")}</Link>
        <DocLangSwitch t={t} />
      </div>
      <h1>{t("report.title")}</h1>
      <p className="lead">{t("report.intro")}</p>

      {cfg && !cfg.sitekey && <p className="notice-closed">{t("report.closed")}</p>}

      {cfg?.sitekey && state.s === "done" && (
        <div className="report-done" role="status">
          <p>{t("report.thanks")}</p>
          <button type="button" className="primary" onClick={restart}>
            {t("report.another")}
          </button>
        </div>
      )}

      {cfg?.sitekey && state.s !== "done" && (
        <form onSubmit={submit} noValidate={false}>
          <fieldset>
            <legend>{t("report.kind.h")}</legend>
            {(["community", "sourced"] as const).map((k) => (
              <label key={k} className="choice">
                <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
                <span>
                  {t(`report.kind.${k}`)}
                  <small>{t(`report.kind.${k}Hint` as MessageKey)}</small>
                </span>
              </label>
            ))}
          </fieldset>

          <label className="field">
            <span>{t("report.type.h")}</span>
            <select value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}>
              {TYPES.filter((ty) => kind === "sourced" || ty !== "notice").map((ty) => (
                <option key={ty} value={ty}>
                  {t(`report.type.${ty}`)}
                </option>
              ))}
            </select>
          </label>

          <div className="row">
            <label className="field">
              <span>{t("report.date")}</span>
              <input type="date" required min={FIRST_DATE} max={localToday()} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              <span>{t("report.start")}</span>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="field">
              <span>{t("report.end")}</span>
              <input type="time" value={end} disabled={ongoing} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          <label className="choice inline">
            <input type="checkbox" checked={ongoing} onChange={(e) => setOngoing(e.target.checked)} />
            <span>{t("report.ongoing")}</span>
          </label>

          <fieldset>
            <legend>{t("report.where.h")}</legend>
            {(["areas", "island", "unknown"] as const).map((sc) => (
              <label key={sc} className="choice inline">
                <input type="radio" name="scope" value={sc} checked={scope === sc} onChange={() => setScope(sc)} />
                <span>{t(`report.where.${sc}`)}</span>
              </label>
            ))}
            {scope === "areas" && (
              <div className="areas">
                <div className="row">
                  <label className="field grow">
                    <span>{t("report.areas.label")}</span>
                    <input
                      list="gw-places"
                      value={pick}
                      aria-invalid={pickError}
                      onChange={(e) => setPick(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addArea();
                        }
                      }}
                    />
                    <datalist id="gw-places">
                      {NAMES.map((n) => (
                        <option key={n} value={n} />
                      ))}
                    </datalist>
                  </label>
                  <button type="button" className="secondary" onClick={addArea}>
                    {t("report.areas.add")}
                  </button>
                </div>
                {pickError && <p className="field-error">{t("report.areas.unknown")}</p>}
                {areas.length > 0 && (
                  <ul className="picked">
                    {areas.map((a) => (
                      <li key={a}>
                        {a}
                        <button type="button" aria-label={t("report.areas.remove", { name: a })} onClick={() => setAreas(areas.filter((x) => x !== a))}>
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </fieldset>

          {kind === "sourced" && (
            <label className="field">
              <span>{t("report.source")}</span>
              <input type="url" required pattern="https://.+" placeholder="https://" value={source} onChange={(e) => setSource(e.target.value)} />
            </label>
          )}

          <label className="field">
            <span>{t("report.note")}</span>
            <textarea maxLength={500} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            <small>{t("report.noteHint")}</small>
          </label>

          {/* for bots only: people never see this field */}
          <label className="hp" aria-hidden="true">
            Website
            <input type="text" name="website" tabIndex={-1} autoComplete="off" value={honey} onChange={(e) => setHoney(e.target.value)} />
          </label>

          <div ref={widget} className="turnstile" />
          <p className="sub">{t("report.privacy")}</p>
          {state.s === "error" && (
            <p className="field-error" role="alert">
              {state.msg}
            </p>
          )}
          <button type="submit" className="primary" disabled={state.s === "sending" || (scope === "areas" && !areas.length)}>
            {state.s === "sending" ? t("report.sending") : t("report.send")}
          </button>
        </form>
      )}
    </main>
  );
}
