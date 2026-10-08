"use client";
import { useEffect, useRef, useState } from "react";
import { IslandScene, type SceneSite } from "@/scene/IslandScene";
import type { Tone } from "@/lib/levels";
import type { Translate } from "@/i18n";

export interface StageSite {
  slug: string;
  name: string;
  meta: string;
  tone: Tone;
  scene: SceneSite;
}

interface Props {
  sites: StageSite[];
  windMs: number;
  selected: string | null;
  onSelect: (slug: string | null) => void;
  night: boolean;
  card: React.ReactNode;
  onWebgl: (ok: boolean) => void;
  t: Translate;
}

// The island area (#main): canvas, site buttons, the site card and the compass.
// Site buttons are real <button>s (spec 4.4): floating labels in the wide layout, visually hidden
// otherwise (sites are tapped on the island), and a plain list when WebGL is unavailable.
export function IslandStage({ sites, windMs, selected, onSelect, night, card, onWebgl, t }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const leaderRef = useRef<SVGLineElement>(null);
  const needleRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const labels = useRef(new Map<string, HTMLElement>());
  const sceneRef = useRef<IslandScene | null>(null);
  const [ready, setReady] = useState(false);

  // latest values for the scene callbacks
  const live = useRef({ onSelect, selected });
  useEffect(() => {
    live.current = { onSelect, selected };
  });

  useEffect(() => {
    const scene = IslandScene.create(
      {
        stage: stageRef.current!,
        canvas: canvasRef.current!,
        leader: leaderRef.current!,
        needle: needleRef.current!,
        card: cardRef.current!,
        hud: () => document.getElementById("hud"),
        days: () => document.getElementById("days"),
        labels: labels.current,
      },
      sites.map((s) => s.scene),
      document.documentElement.dataset.mode === "night",
    );
    onWebgl(!!scene);
    if (!scene) return;
    scene.onPick = (slug) => {
      const { onSelect: select, selected: cur } = live.current;
      if (slug) select(cur === slug ? null : slug);
      else if (cur) select(null);
    };
    sceneRef.current = scene;
    setReady(true);
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
    // the scene is built once; site geometry does not change while the page is open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tones = sites.map((s) => `${s.slug}:${s.tone}`).join(",");
  useEffect(() => {
    sceneRef.current?.setStatuses(Object.fromEntries(sites.map((s) => [s.slug, s.tone])), windMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tones, windMs, ready]);

  useEffect(() => sceneRef.current?.setSelected(selected), [selected, ready]);
  useEffect(() => sceneRef.current?.setNight(night), [night, ready]);

  return (
    <div id="main">
      <div id="stage" ref={stageRef}>
        <canvas id="c" ref={canvasRef} aria-label={t("scene.label")} role="img" />
        <svg id="leader" aria-hidden="true">
          <line id="ln" ref={leaderRef} x1="0" y1="0" x2="0" y2="0" />
        </svg>
        <div id="labels" role="group" aria-label={t("scene.sites")}>
          <p className="fallback-note">{t("scene.noWebgl")}</p>
          {sites.map((s) => (
            <button
              key={s.slug}
              ref={(el) => {
                if (el) labels.current.set(s.slug, el);
                else labels.current.delete(s.slug);
              }}
              type="button"
              className="site"
              aria-pressed={selected === s.slug}
              onClick={() => onSelect(selected === s.slug ? null : s.slug)}
              onPointerEnter={() => sceneRef.current?.setHot(s.slug, true)}
              onPointerLeave={() => sceneRef.current?.setHot(s.slug, false)}
              onFocus={() => sceneRef.current?.setHot(s.slug, true)}
              onBlur={() => sceneRef.current?.setHot(s.slug, false)}
            >
              <span className={`dot lg-${s.tone}`} />
              <span className="nm">{s.name}</span>
              <span className="mt">{s.meta}</span>
            </button>
          ))}
        </div>
        <div id="hint" className="card">
          {t("scene.hint")}
        </div>
        <p id="tapHint">{t("scene.tapHint")}</p>
        <article id="card" ref={cardRef} hidden={!selected || !card} aria-labelledby="card-title">
          {card}
        </article>
        <div id="compass" aria-hidden="true">
          <span id="needle" ref={needleRef}>
            N
          </span>
        </div>
      </div>
    </div>
  );
}
