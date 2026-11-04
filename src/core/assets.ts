import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();
const BASE = './assets/';

function setup(t: THREE.Texture) {
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Get a texture (starts loading if needed; fills in when ready). */
export function tex(path: string): THREE.Texture {
  let t = cache.get(path);
  if (!t) {
    t = setup(loader.load(BASE + path));
    cache.set(path, t);
  }
  return t;
}

export function loadTex(path: string): Promise<THREE.Texture> {
  const hit = cache.get(path);
  if (hit && hit.image) return Promise.resolve(hit);
  return new Promise((res) => {
    const t = setup(loader.load(BASE + path, () => res(t), undefined, () => res(t)));
    cache.set(path, t);
  });
}

export interface PipMeta { size: number; bottom: number; cx: number }
export let pipMeta: Record<string, PipMeta> = {};

export async function loadPipMeta() {
  pipMeta = await (await fetch(BASE + 'sprites/pip.json')).json();
}

export const SPRITES = ['alien', 'book', 'bunny', 'butterfly_s', 'chick', 'dragonfly', 'frog_s', 'goldfish', 'hand', 'jellyfish', 'ladybug', 'mouse', 'seahorse', 'shootingstar', 'starfish', 'ufo', 'wand', 'world_farm', 'world_garden', 'world_ocean', 'world_pond', 'world_space'];
export const PIP_POSES = ['idle', 'blink', 'wave', 'cheer', 'point', 'think', 'dance', 'sleep'] as const;
export type PipPose = (typeof PIP_POSES)[number];
