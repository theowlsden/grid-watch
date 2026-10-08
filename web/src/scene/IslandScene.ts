import * as THREE from "three";
import type { SiteKind } from "@/lib/schema";
import type { Tone } from "@/lib/levels";
import { WIDE_MQ, SIDE_CARD_MQ } from "./layout";
import { ball, cyl, gloss, mat, rbox, seeded, shade, turbine } from "./models";

// The 3D island (spec 4.4). Ported from docs/prototype/grid-watch-prototype.html.
// The canvas is decorative: every value it shows is also in the cards and lists.
// No sun, solar or battery objects in either mode (spec 4.3, 12.4).

export interface SceneSite {
  slug: string;
  kind: SiteKind;
  uv: [number, number]; // stylised position (u along the island NW to SE, v across), placeholder until projection lands
  parkCount: number | null;
}

export interface SceneElements {
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  leader: SVGLineElement;
  needle: HTMLElement;
  card: HTMLElement;
  // looked up when needed: these render after the forecast loads
  hud: () => HTMLElement | null;
  days: () => HTMLElement | null;
  labels: Map<string, HTMLElement>;
}

interface BuiltSite extends SceneSite {
  group: THREE.Group;
  tile: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  base: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  h: number; // label height above the surface
  ax: number;
  az: number;
  lift: number;
  hot: boolean;
  tone: Tone;
  off: [number, number]; // desktop label offset in px
}

// three.js r128 treated hex colours as linear and used "legacy" light units. Matching the
// prototype's look in this version needs colour management off and lights scaled by PI.
const PI = Math.PI;
THREE.ColorManagement.enabled = false;

const SURF = 0.5;
const UD = new THREE.Vector2(0.82, 0.57);
const VD = new THREE.Vector2(0.57, -0.82);
const K = 1.3;
const AXIS = -Math.atan2(UD.y, UD.x);

// Desktop label nudges for the seed sites, so the floating labels overlap less.
const LABEL_OFFSET: Record<string, [number, number]> = { dokweg: [52, 20] };

function toXZ(u: number, v: number): [number, number] {
  return [UD.x * u + VD.x * v, UD.y * u + VD.y * v];
}

// Stylised outline (km, width exaggerated for the diorama). Replaced by the OSM outline later (spec 7.4).
function topV(u: number): number {
  const t = (u + 30) / 60;
  const e = Math.pow(Math.max(Math.sin(Math.PI * t), 0), 0.5);
  return K * 6.2 * e * (1 + 0.18 * Math.sin(t * 7 + 1) + 0.1 * Math.sin(t * 17));
}
function botV(u: number): number {
  const t = (u + 30) / 60;
  const e = Math.pow(Math.max(Math.sin(Math.PI * t), 0), 0.5);
  let w = 6.8 * e * (1 + 0.2 * Math.sin(t * 11) + 0.08 * Math.sin(t * 23));
  w -= 3.0 * Math.exp(-Math.pow((u - 9) / 1.1, 2));
  return -K * Math.max(w, 0.1);
}

export class IslandScene {
  onPick: (slug: string | null) => void = () => {};

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 1, 800);
  private world = new THREE.Group();
  private hemi = new THREE.HemisphereLight(0xffffff, 0xbfe0ea, 0.95 * PI);
  private sun = new THREE.DirectionalLight(0xfff6e6, 0.85 * PI);
  private fill = new THREE.DirectionalLight(0xcfe9ff, 0.35 * PI);
  private stars!: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private blob!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private topMat = mat(0xaee04f, { r: 0.6 });
  private rotors: THREE.Group[] = [];
  private puffs: { m: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>; x: number; ph: number }[] = [];
  private winMats: THREE.MeshStandardMaterial[] = [];
  private sites: BuiltSite[] = [];
  private tones: Record<Tone, THREE.Color> = {} as Record<Tone, THREE.Color>;

  private cam = { az: -0.45, pol: 0.95, r: 80, tr: 80 };
  private touched = false;
  private nk = 0;
  private nightTarget = 0;
  private wind = 8;
  private selected: BuiltSite | null = null;
  private viewOff = 0;
  private sheetPx = 0;
  private raf = 0;
  private v3 = new THREE.Vector3();
  private wideMQ = window.matchMedia(WIDE_MQ);
  private sideMQ = window.matchMedia(SIDE_CARD_MQ);
  private reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  private ro: ResizeObserver;
  private cleanup: (() => void)[] = [];

  private static readonly ENV = {
    d: { hs: new THREE.Color(0xffffff), hg: new THREE.Color(0xbfe0ea), hi: 0.95, sc: new THREE.Color(0xfff6e6), si: 0.85, fi: 0.35 },
    n: { hs: new THREE.Color(0x86a4ea), hg: new THREE.Color(0x0e1c30), hi: 0.7, sc: new THREE.Color(0xa6c4ff), si: 0.62, fi: 0.14 },
  };

  /** Returns null when WebGL is unavailable; the page then shows the 2D site list. */
  static create(els: SceneElements, sites: SceneSite[], night: boolean): IslandScene | null {
    try {
      const probe = els.canvas.getContext("webgl2") ?? els.canvas.getContext("webgl");
      if (!probe) return null;
      return new IslandScene(els, sites, night);
    } catch {
      return null;
    }
  }

  private constructor(private els: SceneElements, sites: SceneSite[], night: boolean) {
    const r = new THREE.WebGLRenderer({ canvas: els.canvas, antialias: true, alpha: true });
    this.renderer = r;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;

    this.readTones();
    this.buildLights();
    this.buildStars();
    this.scene.add(this.world);
    this.buildIsland();
    for (const s of sites) this.buildSite(s);
    this.buildDecor();
    this.puffs.forEach((p) => (p.m.castShadow = false));

    this.nightTarget = this.nk = night ? 1 : 0;
    els.leader.setAttribute("hidden", "");
    this.bindPointer();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(els.stage);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------- public API ----------

  setStatuses(tones: Record<string, Tone>, windMs: number): void {
    this.wind = windMs;
    for (const s of this.sites) {
      s.tone = tones[s.slug] ?? "unknown";
      const c = this.tones[s.tone];
      s.tile.material.color.copy(c);
      s.base.material.color.copy(c).multiplyScalar(0.68);
    }
  }

  setSelected(slug: string | null): void {
    this.selected = this.sites.find((s) => s.slug === slug) ?? null;
    if (!this.selected) this.els.leader.setAttribute("hidden", "");
  }

  setHot(slug: string, hot: boolean): void {
    const s = this.sites.find((x) => x.slug === slug);
    if (s) s.hot = hot;
  }

  setNight(night: boolean): void {
    this.nightTarget = night ? 1 : 0;
    this.readTones();
    this.setStatuses(Object.fromEntries(this.sites.map((s) => [s.slug, s.tone])), this.wind);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.cleanup.forEach((f) => f());
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      mats.forEach((x) => x.dispose());
    });
    this.renderer.dispose();
  }

  // ---------- building ----------

  private readTones(): void {
    const css = getComputedStyle(document.documentElement);
    for (const k of ["ok", "watch", "warn", "crit", "unknown"] as Tone[]) {
      this.tones[k] = new THREE.Color(css.getPropertyValue(`--${k}`).trim() || "#9fb6c0");
    }
  }

  private buildLights(): void {
    this.scene.add(this.hemi);
    const sun = this.sun;
    sun.position.set(34, 60, 26);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006;
    Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 5, far: 160 });
    this.scene.add(sun);
    this.fill.position.set(-30, 20, -20);
    this.scene.add(this.fill);
  }

  private buildStars(): void {
    const n = 240;
    const pos = new Float32Array(n * 3);
    const rnd = seeded(11);
    for (let i = 0; i < n; i++) {
      const th = rnd() * Math.PI * 2;
      const ph = Math.acos(2 * rnd() - 1);
      const rr = 420;
      pos[i * 3] = rr * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = rr * Math.cos(ph);
      pos[i * 3 + 2] = rr * Math.sin(ph) * Math.sin(th);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(
      g,
      new THREE.PointsMaterial({ color: 0xd6e6ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.scene.add(this.stars);
  }

  private buildIsland(): void {
    const outline: [number, number][] = [];
    for (let i = -30; i <= 30; i++) outline.push([i, topV(i)]);
    for (let i = 30; i >= -30; i--) outline.push([i, botV(i)]);
    const slab = (su: number, sv: number, depth: number, bevel: number) => {
      const sh = new THREE.Shape();
      outline.forEach(([u, v], k) => {
        const [x, z] = toXZ(u * su, v * sv);
        if (k === 0) sh.moveTo(x, -z);
        else sh.lineTo(x, -z);
      });
      const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 1 });
      g.rotateX(-Math.PI / 2);
      return g;
    };
    const rim = new THREE.Mesh(slab(1, 1, 0.7, 0.3), mat(0xb9784a, { r: 0.6 }));
    rim.geometry.translate(0, -1.0, 0);
    const band = new THREE.Mesh(slab(1, 1, 0.05, 0.3), mat(0xd9a06a, { r: 0.6 }));
    band.geometry.translate(0, -0.3, 0);
    const grass = new THREE.Mesh(slab(0.965, 0.93, 0.2, 0.2), this.topMat);
    grass.geometry.translate(0, 0.1, 0);
    this.world.add(shade(rim), shade(band), shade(grass));

    // soft shadow blob under the floating island
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g2 = c.getContext("2d")!;
    const rg = g2.createRadialGradient(64, 64, 4, 64, 64, 62);
    rg.addColorStop(0, "rgba(60,120,150,0.38)");
    rg.addColorStop(1, "rgba(60,120,150,0)");
    g2.fillStyle = rg;
    g2.fillRect(0, 0, 128, 128);
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.rotation.z = Math.atan2(UD.y, UD.x);
    this.blob.scale.set(86, 34, 1);
    this.blob.position.y = -5;
    this.scene.add(this.blob);
  }

  private buildDecor(): void {
    const R = seeded(7);
    const hills: [number, number, number, number][] = [
      [-8, 1.0, 4.2, 1.7],
      [-6, -3.0, 2.8, 1.0],
      [14, 1.0, 3.6, 1.3],
      [-20, -0.5, 3.0, 1.0],
    ];
    // keep hills off the site tiles
    const freeHills = hills.filter((h) => !this.sites.some((s) => Math.hypot(s.uv[0] - h[0], s.uv[1] - h[1]) < h[2] + 2.4));
    for (const h of freeHills) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), mat(0xc3ea6a, { r: 0.6 }));
      const [x, z] = toXZ(h[0], h[1]);
      m.scale.set(h[2], h[3], h[2]);
      m.position.set(x, SURF - 0.1, z);
      this.world.add(shade(m));
    }
    const near = (u: number, v: number, d: number) =>
      this.sites.some((s) => Math.hypot(s.uv[0] - u, s.uv[1] - v) < d + (s.parkCount && s.parkCount > 1 ? 1.4 : 0)) ||
      freeHills.some((h) => Math.hypot(h[0] - u, h[1] - v) < h[2] + 0.8);
    const inside = (u: number, v: number) => u > -27 && u < 27 && v < topV(u) * 0.7 && v > botV(u) * 0.7;
    let placed = 0;
    for (let tries = 0; placed < 30 && tries < 600; tries++) {
      const u = -27 + R() * 54;
      const v = botV(u) + R() * (topV(u) - botV(u));
      if (!inside(u, v) || near(u, v, 4.6)) continue;
      const [x, z] = toXZ(u, v);
      const g = new THREE.Group();
      if (placed % 4 === 3) {
        const rock = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), mat(0xd3dce0, { r: 0.7 }));
        rock.scale.set(1, 0.6, 0.8);
        rock.position.y = 0.1;
        g.add(rock);
      } else {
        for (let b = 0; b < 3; b++) {
          const bush = new THREE.Mesh(new THREE.SphereGeometry(0.34 + R() * 0.26, 14, 10), mat(b % 2 ? 0x6cc443 : 0x52b53a, { r: 0.6 }));
          bush.position.set((b - 1) * 0.42, 0.25 + R() * 0.1, (R() - 0.5) * 0.4);
          g.add(bush);
        }
      }
      g.position.set(x, SURF - 0.05, z);
      this.world.add(shade(g));
      placed++;
    }
  }

  private buildSite(s: SceneSite): void {
    const [x, z] = toXZ(s.uv[0], s.uv[1]);
    const g = new THREE.Group();
    g.position.set(x, SURF, z);
    g.rotation.y = AXIS;
    const twoParks = s.kind === "wind" && (s.parkCount ?? 1) > 1;
    const w = twoParks ? 7.4 : s.kind === "wind" ? 5.0 : 4.4;
    const d = s.kind === "wind" ? 5.0 : 4.4;
    const base = rbox(w + 0.4, 0.3, d + 0.4, 1.2, mat(0xffffff)) as BuiltSite["base"];
    const tile = rbox(w, 0.3, d, 1.1, gloss(0x9fb6c0)) as BuiltSite["tile"];
    tile.position.y = 0.26;
    g.add(base, tile);
    const a = new THREE.Group();
    a.position.y = 0.56;
    g.add(a);
    let h = 3.4;

    if (s.kind === "wind") {
      // one cluster of three per park; Tera Kora (two parks) gets two clusters on a wider tile
      const clusters = twoParks ? [-1.85, 1.85] : [0];
      const spread = twoParks ? 0.72 : 1;
      for (const cx of clusters) {
        [[-1.3, 0.9], [1.3, 0.9], [0, -1.0]].forEach(([px, pz], k) => {
          const t = turbine();
          t.group.position.set(cx + px * spread, 0, pz);
          t.group.scale.setScalar(twoParks ? 0.8 : 0.88);
          t.group.rotation.y = (k - 1) * 0.12;
          a.add(t.group);
          this.rotors.push(t.rotor);
        });
      }
      h = 3.6;
    } else if (s.kind === "thermal") {
      const body = rbox(2.8, 1.5, 2.1, 0.5, gloss(0xfff0cf));
      body.position.set(0, 0, 0.5);
      const roof = rbox(2.95, 0.28, 2.25, 0.2, gloss(0xff7a5c));
      roof.position.set(0, 1.3, 0.5);
      a.add(body, roof);
      [-0.9, 0, 0.9].forEach((wx) => {
        const wm = mat(0x86bcff, { r: 0.3 });
        this.winMats.push(wm);
        const win = rbox(0.5, 0.42, 0.12, 0.14, wm);
        win.position.set(wx, 0.55, 1.58);
        a.add(win);
      });
      [-0.65, 0.65].forEach((cx, k) => {
        [0xffffff, 0xff7a5c, 0xffffff].forEach((c, j) => {
          const seg = cyl(0.3 - j * 0.02, 0.33 - j * 0.02, 0.7, mat(c, { r: 0.45 }));
          seg.position.set(cx, 1.5 + j * 0.7 + 0.35, -0.5);
          a.add(seg);
        });
        const rimc = cyl(0.34, 0.3, 0.14, mat(0x10312a), 20);
        rimc.position.set(cx, 3.65, -0.5);
        a.add(rimc);
        for (let q = 0; q < 2; q++) {
          const pf = ball(1, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, transparent: true })) as THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
          this.puffs.push({ m: pf, x: cx, ph: (q * 0.5 + k * 0.25) % 1 });
          a.add(pf);
        }
      });
      h = 4.8;
    } else {
      // generic marker for sites without a model (spec 7.4): a clay pillar on the status tile
      const pillar = rbox(1.2, 2.2, 1.2, 0.5, gloss(0xfff0cf));
      a.add(pillar);
    }

    shade(g);
    this.world.add(g);
    this.sites.push({ ...s, group: g, tile, base, h, ax: x, az: z, lift: 0, hot: false, tone: "unknown", off: LABEL_OFFSET[s.slug] ?? [0, -8] });
  }

  // ---------- camera and input ----------

  private wide(): boolean {
    return this.wideMQ.matches;
  }

  private resize = (): void => {
    const { stage } = this.els;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.touched) {
      this.cam.r = this.cam.tr = Math.max(58, Math.min(215, 76 / (0.69 * (w / h))));
      this.cam.pol = this.wide() ? 0.95 : 0.82;
    }
  };

  private bindPointer(): void {
    const stage = this.els.stage;
    const ptrs = new Map<number, { x: number; y: number }>();
    let pinch0 = 0;
    let tap: { id: number; x: number; y: number } | null = null;
    const dist = () => {
      const [a, b] = [...ptrs.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest(".site, #labels, #card, .legend, #hint")) return;
      stage.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      stage.classList.add("drag");
      this.touched = true;
      if (ptrs.size === 2) pinch0 = dist();
      tap = ptrs.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
    };
    const move = (e: PointerEvent) => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      if (ptrs.size === 1) {
        this.cam.az -= (e.clientX - p.x) * 0.005;
        this.cam.pol = Math.max(0.3, Math.min(1.4, this.cam.pol - (e.clientY - p.y) * 0.004));
      }
      p.x = e.clientX;
      p.y = e.clientY;
      if (ptrs.size === 2) {
        const d = dist();
        if (pinch0) this.cam.tr = Math.max(35, Math.min(230, (this.cam.tr * pinch0) / d));
        pinch0 = d;
      }
    };
    const up = (e: PointerEvent) => {
      // a short tap without dragging picks the site under the pointer
      if (tap && tap.id === e.pointerId && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 6) {
        const hit = this.pick(e);
        this.onPick(hit ? hit.slug : null);
      }
      tap = null;
      ptrs.delete(e.pointerId);
      pinch0 = 0;
      if (!ptrs.size) stage.classList.remove("drag");
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.touched = true;
      this.cam.tr = Math.max(35, Math.min(230, this.cam.tr * (1 + e.deltaY * 0.001)));
    };
    stage.addEventListener("pointerdown", down);
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerup", up);
    stage.addEventListener("pointercancel", up);
    stage.addEventListener("wheel", wheel, { passive: false });
    this.cleanup.push(() => {
      stage.removeEventListener("pointerdown", down);
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerup", up);
      stage.removeEventListener("pointercancel", up);
      stage.removeEventListener("wheel", wheel);
    });
  }

  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private pick(e: PointerEvent): BuiltSite | null {
    const r = this.els.stage.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = this.ray.intersectObjects(this.sites.map((s) => s.group), true)[0];
    if (hit) {
      return this.sites.find((s) => {
        let o: THREE.Object3D | null = hit.object;
        while (o && o !== s.group) o = o.parent;
        return o === s.group;
      }) ?? null;
    }
    // tiles are small on phones: otherwise take the nearest site within finger reach (30 px)
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    let best: BuiltSite | null = null;
    let bd = 30;
    for (const s of this.sites) {
      const [qx, qy] = this.project(s.ax, s.group.position.y + this.world.position.y + 1, s.az);
      const d = Math.hypot(qx - px, qy - py);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  private project(x: number, y: number, z: number): [number, number] {
    const v = this.v3.set(x, y, z).project(this.camera);
    const { stage } = this.els;
    return [(v.x * 0.5 + 0.5) * stage.clientWidth, (-v.y * 0.5 + 0.5) * stage.clientHeight];
  }

  // Portrait up to 1500 px: while the bottom sheet is open, centre the island in the space
  // above it (positive offsets move the island up) and pull back a little.
  private sheetView(reduce: boolean): number {
    const { card, stage } = this.els;
    const compactSheet = !this.wide() && !this.sideMQ.matches && this.selected && !card.hidden;
    const sheet = compactSheet ? card.offsetHeight + 8 : 0;
    const k = reduce ? 1 : 0.15;
    this.viewOff += (sheet / 2 - this.viewOff) * k;
    this.sheetPx += (sheet - this.sheetPx) * k;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (Math.abs(this.viewOff) > 0.5) this.camera.setViewOffset(w, h, 0, this.viewOff, w, h);
    else if (this.camera.view?.enabled) this.camera.clearViewOffset();
    return h > 0 ? Math.min(1.35, h / Math.max(h - this.sheetPx, 1)) : 1;
  }

  // ---------- render loop ----------

  private frame = (t: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const s = t * 0.001;
    const reduce = this.reduceMQ.matches;
    const { cam, camera, els } = this;
    const wide = this.wide();

    cam.r += (cam.tr - cam.r) * 0.12;
    const rr = cam.r * this.sheetView(reduce);
    camera.position.set(rr * Math.sin(cam.pol) * Math.sin(cam.az), rr * Math.cos(cam.pol), rr * Math.sin(cam.pol) * Math.cos(cam.az));
    camera.lookAt(0, 0, 0);
    els.needle.style.transform = `rotate(${cam.az}rad)`;

    // blend day and night (about 1 s)
    this.nk += (this.nightTarget - this.nk) * (reduce ? 1 : 0.06);
    if (Math.abs(this.nightTarget - this.nk) < 0.002) this.nk = this.nightTarget;
    const nk = this.nk;
    const { d, n } = IslandScene.ENV;
    this.hemi.color.copy(d.hs).lerp(n.hs, nk);
    this.hemi.groundColor.copy(d.hg).lerp(n.hg, nk);
    this.hemi.intensity = (d.hi + (n.hi - d.hi) * nk) * PI;
    this.sun.color.copy(d.sc).lerp(n.sc, nk);
    this.sun.intensity = (d.si + (n.si - d.si) * nk) * PI;
    this.fill.intensity = (d.fi + (n.fi - d.fi) * nk) * PI;
    this.stars.material.opacity = nk * 0.9;
    this.stars.rotation.y = reduce ? 0 : s * 0.004;
    this.topMat.emissive.set(0x123d26).multiplyScalar(nk * 0.9);
    this.winMats.forEach((m) => m.emissive.set(0xffc65a).multiplyScalar(nk));
    this.blob.material.opacity = 1 - nk * 0.35;

    const bob = reduce ? 0 : Math.sin(s * 0.9) * 0.2;
    this.world.position.y = bob;

    const spin = reduce ? 0 : this.wind * 0.011;
    this.rotors.forEach((r, i) => (r.rotation.z += spin * (0.9 + (i % 3) * 0.1)));
    this.puffs.forEach((p) => {
      const k = reduce ? 0.4 : (s * 0.22 + p.ph) % 1;
      p.m.position.set(p.x + k * 0.5, 4.4 + k * 2.2, -0.5);
      p.m.scale.setScalar(0.18 + k * 0.38);
      p.m.material.opacity = reduce ? 0 : 0.9 * (1 - k);
    });

    this.sites.forEach((site, i) => {
      const target = this.selected === site ? 0.45 : site.hot ? 0.25 : 0;
      site.lift += (target - site.lift) * (reduce ? 1 : 0.14);
      site.group.position.y = SURF + site.lift + (reduce ? 0 : Math.sin(s * 1.6 + i) * 0.04);
      site.tile.material.emissive.copy(this.tones[site.tone]).multiplyScalar(0.5 * nk);
      const el = els.labels.get(site.slug);
      if (!el) return;
      // over 1500 px labels float above their site; below that CSS hides them
      if (wide) {
        const [px, py] = this.project(site.ax, SURF + site.h + site.lift + bob, site.az);
        el.style.transform = `translate(${px + site.off[0]}px,${py + site.off[1]}px) translate(-50%,-100%)`;
      } else el.style.transform = "";
    });

    this.placeCard(bob);
    this.renderer.render(this.scene, camera);
  };

  private placeCard(bob: number): void {
    const { card, leader, stage, hud, days } = this.els;
    const sel = this.selected;
    if (!sel || card.hidden) return;
    if (this.wide()) {
      // card beside the site with a dashed leader line
      card.style.left = card.style.top = card.style.width = card.style.maxHeight = "";
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      const g = 16;
      const [px, py] = this.project(sel.ax, SURF + sel.h * 0.5 + bob, sel.az);
      const cw = card.offsetWidth;
      const ch = card.offsetHeight;
      let x = px + 90;
      if (x + cw > w - g) x = px - 90 - cw;
      x = Math.max(g, Math.min(w - cw - g, x));
      const y = Math.max(70, Math.min(h - ch - 70, py - ch / 2));
      card.style.transform = `translate(${x}px,${y}px)`;
      const ex = Math.max(x, Math.min(x + cw, px));
      const ey = Math.max(y, Math.min(y + ch, py));
      leader.setAttribute("x1", String(px));
      leader.setAttribute("y1", String(py));
      leader.setAttribute("x2", String(ex));
      leader.setAttribute("y2", String(ey));
      leader.removeAttribute("hidden");
      return;
    }
    card.style.transform = "none";
    leader.setAttribute("hidden", "");
    const hudEl = hud();
    const daysEl = days();
    if (this.sideMQ.matches && hudEl && daysEl) {
      // landscape: the card takes the place of the risk card
      const hr = hudEl.getBoundingClientRect();
      const dr = daysEl.getBoundingClientRect();
      card.style.left = `${hr.left}px`;
      card.style.top = `${hr.top}px`;
      card.style.width = `${hr.width}px`;
      card.style.maxHeight = `${Math.max(120, dr.top - 10 - hr.top)}px`;
    } else {
      card.style.left = card.style.top = card.style.width = card.style.maxHeight = "";
    }
  }
}
