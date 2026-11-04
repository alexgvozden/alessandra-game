import * as THREE from 'three';

const cache = new Map<string, THREE.MeshPhysicalMaterial>();

/** Glossy "jelly candy" material shared by tiles, buttons, letters and stars. */
export function candy(color: THREE.ColorRepresentation, opts: { rough?: number; shared?: boolean; emissive?: number } = {}) {
  const c = new THREE.Color(color);
  const key = `${c.getHexString()}-${opts.rough ?? 0.32}-${opts.emissive ?? 0}`;
  if (opts.shared !== false && cache.has(key)) return cache.get(key)!;
  const m = new THREE.MeshPhysicalMaterial({
    color: c,
    roughness: opts.rough ?? 0.32,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.22,
    sheen: 0.4,
    sheenColor: new THREE.Color(0xffffff),
    sheenRoughness: 0.5,
    emissive: c.clone().multiplyScalar(opts.emissive ?? 0.03),
  });
  if (opts.shared !== false) cache.set(key, m);
  return m;
}

/** A private (animatable) copy of a candy material. */
export function candyOwn(color: THREE.ColorRepresentation, rough = 0.32) {
  return candy(color, { rough, shared: false });
}

/** Unlit textured material for illustrations and sprites (keeps the painted colours exact). */
export function flat(map: THREE.Texture | null, opts: { transparent?: boolean; opacity?: number } = {}) {
  return new THREE.MeshBasicMaterial({
    map,
    transparent: opts.transparent ?? true,
    opacity: opts.opacity ?? 1,
    depthWrite: false,
    toneMapped: false,
  });
}
