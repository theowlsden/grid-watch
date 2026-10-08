import * as THREE from "three";

// Clay-diorama building blocks (spec 4.4 and the 3D palette in spec 10).

export function mat(color: number, o: { r?: number; e?: number } = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.55, metalness: 0, emissive: o.e ?? 0x000000 });
}

export function gloss(color: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.25 });
}

export function shade<T extends THREE.Object3D>(o: T, cast = true, recv = true): T {
  o.traverse((n) => {
    if ((n as THREE.Mesh).isMesh) {
      n.castShadow = cast;
      n.receiveShadow = recv;
    }
  });
  return o;
}

function rrShape(w: number, d: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// Rounded box standing on y = 0.
export function rbox(w: number, h: number, d: number, r: number, m: THREE.Material): THREE.Mesh {
  const b = Math.min(0.17, r * 0.5, h * 0.45);
  const g = new THREE.ExtrudeGeometry(rrShape(w - 2 * b, d - 2 * b, Math.max(r - b, 0.02)), {
    depth: Math.max(h - 2 * b, 0.001),
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 4,
    curveSegments: 8,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, b, 0);
  return new THREE.Mesh(g, m);
}

export function cyl(rt: number, rb: number, h: number, m: THREE.Material, seg = 20): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
}

export function ball(r: number, m: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), m);
}

// White turbine with a yellow hub; the rotor group is returned so it can spin with the wind.
export function turbine(): { group: THREE.Group; rotor: THREE.Group } {
  const g = new THREE.Group();
  const white = mat(0xffffff, { r: 0.4 });
  const tower = cyl(0.1, 0.2, 2.5, white, 18);
  tower.position.y = 1.25;
  g.add(tower);
  const nacelle = ball(0.3, white);
  nacelle.scale.set(1, 1, 1.5);
  nacelle.position.y = 2.55;
  g.add(nacelle);
  const hub = ball(0.2, mat(0xffc93c, { r: 0.4 }));
  hub.position.set(0, 2.55, 0.46);
  g.add(hub);
  const rotor = new THREE.Group();
  rotor.position.set(0, 2.55, 0.52);
  for (let b = 0; b < 3; b++) {
    const arm = new THREE.Group();
    arm.rotation.z = (b * Math.PI * 2) / 3;
    const blade = ball(1, white);
    blade.scale.set(0.17, 0.85, 0.05);
    blade.position.y = 0.88;
    arm.add(blade);
    rotor.add(arm);
  }
  g.add(rotor);
  return { group: g, rotor };
}

// Seeded random numbers so the decor is the same on every load.
export function seeded(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
