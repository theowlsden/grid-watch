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
  xz: [number, number]; // scene position: projected lat/lon (lib/projection.ts) or stylisedXZ()
  parkCount: number; // one turbine cluster per park
  rotationDeg?: number | null; // extra turn of the model (spec 7.4 modelRotation)
}

/** The island to build: the projected coastline in scene units, or null for the stylised island. */
export interface SceneIsland {
  coast: [number, number][] | null;
  north: number; // radians, see lib/projection.ts northAngle()
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
  model: THREE.Group; // the code-built model on top of the tile; replaced by a handmade one
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
// Tuned for the default view of the real island: the three eastern sites are only 3 to 6 km apart.
const LABEL_OFFSET: Record<string, [number, number]> = { dokweg: [-150, 48], playakanoa: [-70, -6], koraaltabak: [86, 6] };

function toXZ(u: number, v: number): [number, number] {
  return [UD.x * u + VD.x * v, UD.y * u + VD.y * v];
}

/** Scene position of a stylised placeholder (u along the island, v across), used without an outline. */
export function stylisedXZ(u: number, v: number): [number, number] {
  return toXZ(u, v);
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

// Read-only view of the scene for automated tests (spec 11). Only exposed when the browser is
// driven by automation (navigator.webdriver), never for normal visitors.
export interface SceneTestHook {
  frames: () => number;
  objectNames: () => string[];
  /** Viewport position of a site's tile, for tap tests. */
  sitePoint: (slug: string) => [number, number] | null;
  /** Viewport bounding box of the island's top surface. */
  islandBox: () => { x0: number; y0: number; x1: number; y1: number };
}

declare global {
  interface Window {
    __gridWatch?: SceneTestHook;
  }
}

// The ground the scene is built on: coastline, long axis and size, plus an inside test.
interface Land {
  coast: [number, number][]; // rim outline, scene units
  top: [number, number][]; // grass outline (for the test hook)
  axis: number; // rotation.y that lines tiles up with the island
  length: number; // along the axis, scene units
  width: number;
  centre: [number, number];
  real: boolean;
  inside: (x: number, z: number, margin: number) => boolean;
}

function stylisedLand(): Land {
  const coastUV: [number, number][] = [];
  for (let i = -30; i <= 30; i++) coastUV.push([i, topV(i)]);
  for (let i = 30; i >= -30; i--) coastUV.push([i, botV(i)]);
  return {
    coast: coastUV.map(([u, v]) => toXZ(u, v)),
    top: coastUV.map(([u, v]) => toXZ(u * 0.965, v * 0.93)),
    axis: AXIS,
    length: 60,
    width: 16,
    centre: [0, 0],
    real: false,
    inside: (x, z) => {
      // back to (u, v): UD and VD are (almost) orthonormal
      const u = UD.x * x + UD.y * z;
      const v = VD.x * x + VD.y * z;
      return u > -27 && u < 27 && v < topV(u) * 0.7 && v > botV(u) * 0.7;
    },
  };
}

function pointInRing(x: number, z: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distToRing(x: number, z: number, ring: [number, number][]): number {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[j];
    const [bx, bz] = ring[i];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
  }
  return best;
}

function realLand(coast: [number, number][]): Land {
  // principal axis of the outline points gives the island's long direction
  const n = coast.length;
  const cx = coast.reduce((a, p) => a + p[0], 0) / n;
  const cz = coast.reduce((a, p) => a + p[1], 0) / n;
  let sxx = 0, szz = 0, sxz = 0;
  for (const [x, z] of coast) {
    sxx += (x - cx) ** 2;
    szz += (z - cz) ** 2;
    sxz += (x - cx) * (z - cz);
  }
  const theta = 0.5 * Math.atan2(2 * sxz, sxx - szz); // angle of the long axis in the x-z plane
  const ax = [Math.cos(theta), Math.sin(theta)];
  const along = coast.map(([x, z]) => (x - cx) * ax[0] + (z - cz) * ax[1]);
  const across = coast.map(([x, z]) => -(x - cx) * ax[1] + (z - cz) * ax[0]);
  return {
    coast,
    top: coast,
    axis: -theta,
    length: Math.max(...along) - Math.min(...along),
    width: Math.max(...across) - Math.min(...across),
    centre: [cx, cz],
    real: true,
    inside: (x, z, margin) => pointInRing(x, z, coast) && distToRing(x, z, coast) > margin,
  };
}

export class IslandScene {
  onPick: (slug: string | null) => void = () => {};
  private frameCount = 0;
  private outlineXZ: [number, number][] = [];

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
  static create(els: SceneElements, sites: SceneSite[], island: SceneIsland, night: boolean): IslandScene | null {
    try {
      const probe = els.canvas.getContext("webgl2") ?? els.canvas.getContext("webgl");
      if (!probe) return null;
      return new IslandScene(els, sites, island, night);
    } catch {
      return null;
    }
  }

  private land: Land;
  private north: number;

  private constructor(private els: SceneElements, sites: SceneSite[], island: SceneIsland, night: boolean) {
    const r = new THREE.WebGLRenderer({ canvas: els.canvas, antialias: true, alpha: true });
    this.renderer = r;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;

    this.land = island.coast && island.coast.length > 3 ? realLand(island.coast) : stylisedLand();
    this.north = island.north;
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
    if (navigator.webdriver) window.__gridWatch = this.testHook();
  }

  private testHook(): SceneTestHook {
    const toViewport = ([x, y]: [number, number]): [number, number] => {
      const r = this.els.stage.getBoundingClientRect();
      return [r.left + x, r.top + y];
    };
    return {
      frames: () => this.frameCount,
      objectNames: () => {
        const names: string[] = [];
        this.scene.traverse((o) => o.name && names.push(o.name));
        return names;
      },
      sitePoint: (slug) => {
        const s = this.sites.find((x) => x.slug === slug);
        return s ? toViewport(this.project(s.ax, s.group.position.y + this.world.position.y + 0.6, s.az)) : null;
      },
      islandBox: () => {
        const pts = this.outlineXZ.map(([x, z]) => toViewport(this.project(x, SURF + this.world.position.y, z)));
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
      },
    };
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

  /** Joins handmade model nodes to sites by name (spec 7.4, 7.5). */
  attachModel(root: THREE.Object3D): void {
    const presets: Record<string, THREE.Material> = {
      clay_green: mat(0xaee04f, { r: 0.6 }),
      clay_white: mat(0xffffff, { r: 0.45 }),
      glass: mat(0x86bcff, { r: 0.3 }),
    };
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const name = (Array.isArray(m.material) ? m.material[0] : m.material)?.name ?? "";
      if (name === "emissive_window") {
        const w = mat(0x86bcff, { r: 0.3 });
        this.winMats.push(w);
        m.material = w;
      } else if (presets[name]) m.material = presets[name];
      m.castShadow = m.receiveShadow = true;
    });

    const used = new Set<string>();
    for (const site of this.sites) {
      const node = root.getObjectByName(`site_${site.slug}`);
      if (!node) continue; // no model for this site: keep the code-built one
      used.add(node.name);
      node.removeFromParent();
      node.name = `model_site_${site.slug}`;
      node.position.set(0, 0.56, 0);
      node.rotation.set(0, 0, 0);
      site.group.remove(site.model);
      site.group.add(node);
      node.traverse((o) => {
        if (o.name === `${site.slug}_blades`) this.rotors.push(o as THREE.Group);
      });
    }
    // site nodes without a record stay hidden (spec 7.4)
    root.traverse((o) => {
      if (o.name.startsWith("site_") && !used.has(o.name)) {
        o.visible = false;
        if (process.env.NODE_ENV !== "production") console.warn(`[grid-watch] model node "${o.name}" has no site record; hidden`);
      }
    });
    const island = root.getObjectByName("island");
    if (island) {
      // a handmade base replaces the extruded one; it shares the same anchor and scale
      this.world.children.filter((c) => /^island(_rim|_band)?$/.test(c.name)).forEach((c) => (c.visible = false));
      island.removeFromParent();
      island.name = "model_island";
      this.world.add(island);
    }
    root.children.filter((c) => c.name.startsWith("prop_")).forEach((p) => this.world.add(p));
  }

  dispose(): void {
    if (window.__gridWatch && navigator.webdriver) delete window.__gridWatch;
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
    this.hemi.name = "ambient_light";
    this.sun.name = "key_light";
    this.fill.name = "fill_light";
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
    this.stars.name = "stars";
    this.scene.add(this.stars);
  }

  private buildIsland(): void {
    const land = this.land;
    const slab = (pts: [number, number][], depth: number, bevel: number, inset = 0) => {
      const sh = new THREE.Shape();
      pts.forEach(([x, z], k) => (k === 0 ? sh.moveTo(x, -z) : sh.lineTo(x, -z)));
      const g = new THREE.ExtrudeGeometry(sh, {
        depth,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelOffset: -inset,
        bevelSegments: 5,
        curveSegments: 1,
      });
      g.rotateX(-Math.PI / 2);
      return g;
    };
    const rim = new THREE.Mesh(slab(land.coast, 0.7, 0.3), mat(0xb9784a, { r: 0.6 }));
    rim.geometry.translate(0, -1.0, 0);
    const band = new THREE.Mesh(slab(land.coast, 0.05, 0.3), mat(0xd9a06a, { r: 0.6 }));
    band.geometry.translate(0, -0.3, 0);
    // the grass top sits a little inside the rim: the stylised outline is scaled, the real one inset
    const grass = land.real
      ? new THREE.Mesh(slab(land.coast, 0.2, 0.2, 0.25), this.topMat)
      : new THREE.Mesh(slab(land.top, 0.2, 0.2), this.topMat);
    grass.geometry.translate(0, 0.1, 0);
    rim.name = "island_rim";
    band.name = "island_band";
    grass.name = "island";
    this.outlineXZ = land.top;
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
    this.blob.rotation.z = -land.axis;
    this.blob.scale.set(land.length * 1.43, land.width * 2.1, 1);
    this.blob.position.set(land.centre[0], -5, land.centre[1]);
    this.blob.name = "island_shadow";
    this.scene.add(this.blob);
  }

  private buildDecor(): void {
    const R = seeded(7);
    const land = this.land;
    const nearSite = (x: number, z: number, d: number) =>
      this.sites.some((s) => Math.hypot(s.ax - x, s.az - z) < d * this.siteScale + (s.parkCount > 1 ? 1.4 * this.siteScale : 0));

    // hills: fixed spots on the stylised island, seeded spots inside the real coastline
    let hills: [number, number, number, number][] = [
      [-8, 1.0, 4.2, 1.7],
      [-6, -3.0, 2.8, 1.0],
      [14, 1.0, 3.6, 1.3],
      [-20, -0.5, 3.0, 1.0],
    ].map(([u, v, r, h]) => [...toXZ(u, v), r, h] as [number, number, number, number]);
    if (land.real) {
      hills = [];
      const sizes: [number, number][] = [[3.2, 1.4], [2.6, 1.0], [2.4, 1.1], [2.0, 0.8], [2.2, 0.9]];
      for (let tries = 0; hills.length < sizes.length && tries < 400; tries++) {
        const [r, h] = sizes[hills.length];
        const x = land.centre[0] + (R() - 0.5) * land.length;
        const z = land.centre[1] + (R() - 0.5) * land.length;
        if (land.inside(x, z, r + 0.6) && !nearSite(x, z, r + 3.2) && !hills.some((o) => Math.hypot(o[0] - x, o[1] - z) < o[2] + r + 1)) hills.push([x, z, r, h]);
      }
    }
    const freeHills = hills.filter(([x, z, r]) => !nearSite(x, z, r + 2.4));
    for (const [x, z, r, h] of freeHills) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), mat(0xc3ea6a, { r: 0.6 }));
      m.scale.set(r, h, r);
      m.position.set(x, SURF - 0.1, z);
      this.world.add(shade(m));
    }

    // bushes and rocks
    const nearHill = (x: number, z: number) => freeHills.some(([hx, hz, r]) => Math.hypot(hx - x, hz - z) < r + 0.8);
    const target = land.real ? 40 : 30;
    let placed = 0;
    for (let tries = 0; placed < target && tries < 2000; tries++) {
      const x = land.centre[0] + (R() - 0.5) * land.length;
      const z = land.centre[1] + (R() - 0.5) * land.length;
      if (!land.inside(x, z, 0.9) || nearSite(x, z, 4.6) || nearHill(x, z)) continue;
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

  // Sites on the real map are smaller: the island is only a few kilometres wide in places.
  private get siteScale(): number {
    return this.land.real ? 0.75 : 1;
  }

  /** Moves a tile inland (toward the island's long axis) until it fits on land; the site's
   *  real coordinate is unchanged. Wind parks sit on the coast, and a tile is kilometres wide. */
  private onLand([x, z]: [number, number], radius: number): [number, number] {
    const land = this.land;
    if (!land.real || land.inside(x, z, radius)) return [x, z];
    const [cx, cz] = land.centre;
    const ax = [Math.cos(-land.axis), Math.sin(-land.axis)];
    const along = (x - cx) * ax[0] + (z - cz) * ax[1];
    const toward = [cx + along * ax[0] - x, cz + along * ax[1] - z];
    const len = Math.hypot(toward[0], toward[1]) || 1;
    for (let d = 0.25; d <= 3.5; d += 0.25) {
      const nx = x + (toward[0] / len) * d;
      const nz = z + (toward[1] / len) * d;
      if (land.inside(nx, nz, radius)) return [nx, nz];
    }
    return [x + (toward[0] / len) * 3.5, z + (toward[1] / len) * 3.5];
  }

  private buildSite(s: SceneSite): void {
    const halfTile = (s.kind === "wind" ? (s.parkCount > 1 ? 3.9 : 2.7) : 2.4) * this.siteScale;
    const [x, z] = this.onLand(s.xz, halfTile * 0.8);
    const g = new THREE.Group();
    g.name = `site_${s.slug}`; // naming contract for models (spec 7.5)
    g.position.set(x, SURF, z);
    g.rotation.y = this.land.axis + ((s.rotationDeg ?? 0) * Math.PI) / 180;
    g.scale.setScalar(this.siteScale);
    const twoParks = s.kind === "wind" && s.parkCount > 1;
    const w = twoParks ? 7.4 : s.kind === "wind" ? 5.0 : 4.4;
    const d = s.kind === "wind" ? 5.0 : 4.4;
    const base = rbox(w + 0.4, 0.3, d + 0.4, 1.2, mat(0xffffff)) as BuiltSite["base"];
    const tile = rbox(w, 0.3, d, 1.1, gloss(0x9fb6c0)) as BuiltSite["tile"];
    tile.position.y = 0.26;
    g.add(base, tile);
    const a = new THREE.Group();
    a.name = "code_model";
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
          t.group.name = "turbine";
          t.group.position.set(cx + px * spread, 0, pz);
          t.group.scale.setScalar(twoParks ? 0.8 : 0.88);
          t.group.rotation.y = (k - 1) * 0.12;
          a.add(t.group);
          this.rotors.push(t.rotor);
        });
      }
      h = 3.6;
    } else if (s.kind === "thermal") {
      a.name = "power_plant";
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
          pf.name = "smoke";
          this.puffs.push({ m: pf, x: cx, ph: (q * 0.5 + k * 0.25) % 1 });
          a.add(pf);
        }
      });
      h = 4.8;
    } else {
      // generic marker for sites without a model (spec 7.4): a clay pillar on the status tile
      const pillar = rbox(1.2, 2.2, 1.2, 0.5, gloss(0xfff0cf));
      pillar.name = "marker";
      a.add(pillar);
    }

    shade(g);
    this.world.add(g);
    this.sites.push({ ...s, group: g, model: a, tile, base, h: h * this.siteScale, ax: x, az: z, lift: 0, hot: false, tone: "unknown", off: LABEL_OFFSET[s.slug] ?? [0, -8] });
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
      // fit the island's length into the view (tuned on the 60-unit stylised island)
      const k = this.land.length / 60;
      this.cam.r = this.cam.tr = Math.max(58 * k, Math.min(215 * k, (76 * k) / (0.69 * (w / h))));
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
      if ((e.target as Element).closest(".site, #labels, #card, .legend, #hint, #mapCredit")) return;
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

  // Portrait layout: while the bottom sheet is open, centre the island in the space
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
    const [ox, oz] = this.land.centre;
    camera.position.set(ox + rr * Math.sin(cam.pol) * Math.sin(cam.az), rr * Math.cos(cam.pol), oz + rr * Math.sin(cam.pol) * Math.cos(cam.az));
    camera.lookAt(ox, 0, oz);
    // the needle points to true north (spec 4.4): camera turn plus the map's own rotation
    els.needle.style.transform = `rotate(${cam.az + this.north}rad)`;

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
      // in the wide layout labels float above their site; otherwise CSS hides them
      if (wide) {
        const [px, py] = this.project(site.ax, SURF + site.h + site.lift + bob, site.az);
        el.style.transform = `translate(${px + site.off[0]}px,${py + site.off[1]}px) translate(-50%,-100%)`;
      } else el.style.transform = "";
    });

    this.placeCard(bob);
    this.renderer.render(this.scene, camera);
    this.frameCount++;
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
