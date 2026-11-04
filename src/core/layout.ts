import * as THREE from 'three';

/** The game is authored on a 1920x1080 virtual screen (letterboxed to 16:9). */
export const W = 1920;
export const H = 1080;

/** Camera distance for a 30-degree vertical FOV that maps the z=0 plane exactly onto the 1920x1080 design. */
export const CAM_Z = H / 2 / Math.tan(THREE.MathUtils.degToRad(15));

/**
 * Design coordinates (origin top-left, y down, like the mockups) to world coordinates (origin centre, y up).
 * x/y are corrected for perspective so an object at depth z still appears at the given design position.
 */
export function px(x: number, y: number, z = 0): THREE.Vector3 {
  const k = (CAM_Z - z) / CAM_Z;
  return new THREE.Vector3((x - W / 2) * k, (H / 2 - y) * k, z);
}

export function setPx(obj: THREE.Object3D, x: number, y: number, z = obj.position.z): void {
  obj.position.copy(px(x, y, z));
}

export const PALETTE = {
  sky: 0x7ec8f2,
  yellow: 0xffd34e,
  pink: 0xff8fb1,
  mint: 0x7fdbb6,
  lavender: 0xb79cff,
  cream: 0xfff6e5,
  gold: 0xf5b942,
  outline: 0xd9914a,
  purple: 0x8f6fe0,
  green: 0x6ccf4f,
  grey: 0xb9b6c9,
};

export const CANDY = [PALETTE.pink, PALETTE.yellow, PALETTE.mint, PALETTE.sky, PALETTE.lavender];

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Letterbox the #stage element to the largest 16:9 box that fits the window. */
export function fitStage(): { w: number; h: number } {
  const stage = document.getElementById('stage')!;
  const vw = window.innerWidth, vh = window.innerHeight;
  let w = vw, h = (vw * H) / W;
  if (h > vh) { h = vh; w = (vh * W) / H; }
  stage.style.width = `${w}px`;
  stage.style.height = `${h}px`;
  stage.style.left = `${(vw - w) / 2}px`;
  stage.style.top = `${(vh - h) / 2}px`;
  stage.style.setProperty('--scale', String(w / W));
  return { w, h };
}
