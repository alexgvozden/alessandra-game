import * as THREE from 'three';
import gsap from 'gsap';
import { puffyDisc } from '../gfx/shapes';
import { candy, flat } from '../gfx/materials';
import { iconTexture, type IconKind } from '../gfx/canvasTex';
import { tex } from '../core/assets';
import { PALETTE } from '../core/layout';

const discCache = new Map<string, THREE.BufferGeometry>();
function disc(r: number, t: number) {
  const k = `${r}:${t}`;
  if (!discCache.has(k)) discCache.set(k, puffyDisc(r, t));
  return discCache.get(k)!;
}

/** Big round glossy button with a cream rim and an icon or picture on its face. */
export class RoundButton extends THREE.Group {
  body = new THREE.Group();
  face: THREE.Mesh;
  bodyMat: THREE.MeshPhysicalMaterial;

  constructor(public radius: number, color: number, icon: IconKind | { sprite: string; scale?: number }, opts: { rim?: number | null; iconScale?: number } = {}) {
    super();
    this.add(this.body);
    const t = radius * 0.34;
    if (opts.rim !== null) {
      const rim = new THREE.Mesh(disc(radius, t * 0.8), candy(opts.rim ?? PALETTE.cream, { rough: 0.4 }));
      rim.position.z = -t * 0.25;
      this.body.add(rim);
    }
    this.bodyMat = candy(color, { shared: false });
    const top = new THREE.Mesh(disc(radius * 0.86, t), this.bodyMat);
    top.position.z = t * 0.15;
    this.body.add(top);
    const faceSize = typeof icon === 'string' ? radius * (opts.iconScale ?? 1.05) : radius * 1.5 * (icon.scale ?? 1);
    const map = typeof icon === 'string' ? iconTexture(icon) : tex(`sprites/${icon.sprite}.png`);
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(faceSize, faceSize), flat(map));
    this.face.position.z = t * 0.15 + t * 0.62 + 2;
    this.face.renderOrder = 5;
    this.body.add(this.face);
  }

  /** Gentle "press me" pulse. */
  pulse(amount = 0.06, period = 1.1) {
    return gsap.to(this.body.scale, { x: 1 + amount, y: 1 + amount, duration: period / 2, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  }

  popIn(delay = 0) {
    this.scale.setScalar(0.001);
    return gsap.to(this.scale, { x: 1, y: 1, z: 1, duration: 0.7, delay, ease: 'elastic.out(1,0.5)', onComplete: () => { this.userData.baseScale = this.scale.clone(); } });
  }
}
