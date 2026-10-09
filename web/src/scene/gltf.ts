import * as THREE from "three";

// Handmade models (spec 7.5). /models/manifest.json names the .glb to load, or null to keep the
// code-built island and sites. Loaded lazily after first paint; any failure keeps the code
// models, so a broken or missing file never breaks the page.
//
// Naming contract: one node per site named `site_<slug>`, an optional `island` node, props
// prefixed `prop_`, turbine rotors `<slug>_blades` (they spin around their local Z axis).
// Models are authored in scene units (1 unit = the island's metresPerUnit), +Y up, origin at the
// base centre of each site model. Compressed files (Draco/Meshopt) need WebAssembly, which the
// CSP does not allow yet; export uncompressed .glb until that is decided.

export interface Manifest {
  scene: string | null;
}

export async function loadSceneModel(): Promise<THREE.Group | null> {
  try {
    const res = await fetch("/models/manifest.json", { cache: "no-cache" });
    if (!res.ok) return null;
    const manifest = (await res.json()) as Manifest;
    if (!manifest.scene || !/^[\w.-]+\.glb$/.test(manifest.scene)) return null;
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const gltf = await new GLTFLoader().loadAsync(`/models/${manifest.scene}`);
    return gltf.scene;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") console.warn("[grid-watch] model not loaded, keeping code models", err);
    return null;
  }
}
