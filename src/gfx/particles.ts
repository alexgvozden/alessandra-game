import * as THREE from 'three';
import { particleAtlas } from './canvasTex';
import { rand, pick } from '../core/layout';

export const enum PK { Glow = 0, Twinkle = 1, Star = 2, Heart = 3, Confetti = 4, Bubble = 5, Z = 6, Note = 7 }

interface P {
  x: number; y: number; z: number; vx: number; vy: number;
  life: number; max: number; size: number; size1: number;
  r: number; g: number; b: number; a: number;
  rot: number; vrot: number; grav: number; drag: number; kind: number;
  wobble: number; flip: number;
}

export interface EmitOpts {
  kind?: PK | PK[];
  count?: number;
  speed?: [number, number];
  angle?: [number, number]; // radians
  life?: [number, number];
  size?: [number, number];
  shrink?: number; // end size multiplier
  colors?: number[];
  intensity?: number; // >1 blooms (additive layer only)
  gravity?: number;
  drag?: number;
  spread?: number; // spawn radius
  spin?: number;
  additive?: boolean;
  z?: number;
}

const VERT = /* glsl */ `
  attribute vec3 iOffset;
  attribute vec4 iColor;
  attribute vec3 iData; // size, rotation, cell
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    float c = cos(iData.y), s = sin(iData.y);
    vec2 p = mat2(c, s, -s, c) * (position.xy * iData.x);
    float cell = iData.z;
    vUv = (uv + vec2(mod(cell, 4.0), 1.0 - floor(cell / 4.0))) * vec2(0.25, 0.5);
    vColor = iColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(iOffset + vec3(p, 0.0), 1.0);
  }`;
const FRAG = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    vec4 t = texture2D(map, vUv);
    gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
    if (gl_FragColor.a < 0.004) discard;
  }`;

class Layer {
  mesh: THREE.Mesh;
  ps: P[] = [];
  offsets: Float32Array;
  colors: Float32Array;
  data: Float32Array;
  geo: THREE.InstancedBufferGeometry;

  constructor(private max: number, additive: boolean, atlas: THREE.Texture) {
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.attributes.position);
    this.geo.setAttribute('uv', base.attributes.uv);
    this.offsets = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 4);
    this.data = new Float32Array(max * 3);
    this.geo.setAttribute('iOffset', new THREE.InstancedBufferAttribute(this.offsets, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iData', new THREE.InstancedBufferAttribute(this.data, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: { map: { value: atlas } },
      transparent: true, depthWrite: false, depthTest: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 901 : 900;
  }

  add(p: P) { if (this.ps.length < this.max) this.ps.push(p); }

  update(dt: number) {
    const ps = this.ps;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      const k = Math.pow(p.drag, dt * 60);
      p.vx *= k; p.vy *= k;
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      ps[w++] = p;
    }
    ps.length = w;
    for (let i = 0; i < w; i++) {
      const p = ps[i];
      const t = p.life / p.max;
      const fadeIn = Math.min(1, p.life / 0.06);
      const fadeOut = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      let size = p.size + (p.size1 - p.size) * t;
      if (p.kind === PK.Confetti) size *= 1;
      this.offsets[i * 3] = p.x + (p.wobble ? Math.sin(p.life * 6 + p.wobble) * 6 : 0);
      this.offsets[i * 3 + 1] = p.y;
      this.offsets[i * 3 + 2] = p.z;
      this.colors[i * 4] = p.r; this.colors[i * 4 + 1] = p.g; this.colors[i * 4 + 2] = p.b;
      this.colors[i * 4 + 3] = p.a * fadeIn * fadeOut;
      // confetti flips: squash on one axis using rotation trick (scale via size wobble)
      const flip = p.kind === PK.Confetti ? 0.55 + 0.45 * Math.abs(Math.sin(p.life * p.flip)) : 1;
      this.data[i * 3] = size * flip;
      this.data[i * 3 + 1] = p.rot;
      this.data[i * 3 + 2] = p.kind;
    }
    this.geo.instanceCount = w;
    (this.geo.attributes.iOffset as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.iColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.iData as THREE.BufferAttribute).needsUpdate = true;
  }

  clear() { this.ps.length = 0; this.geo.instanceCount = 0; }
}

export const CONFETTI = [0xff8fb1, 0xffd34e, 0x7fdbb6, 0x7ec8f2, 0xb79cff, 0xff9f5a];
export const GOLD = [0xffe07a, 0xffd34e, 0xfff3b0];

/** Particles for sparkles, confetti, glitter trails, bubbles, hearts, zzz... */
export class Particles {
  group = new THREE.Group();
  normal: Layer;
  glow: Layer;

  constructor() {
    const atlas = particleAtlas();
    this.normal = new Layer(2500, false, atlas);
    this.glow = new Layer(2500, true, atlas);
    this.group.add(this.normal.mesh, this.glow.mesh);
  }

  emit(x: number, y: number, o: EmitOpts = {}) {
    const count = o.count ?? 10;
    const kinds = Array.isArray(o.kind) ? o.kind : [o.kind ?? PK.Twinkle];
    const colors = o.colors ?? CONFETTI;
    const [s0, s1] = o.speed ?? [100, 400];
    const [a0, a1] = o.angle ?? [0, Math.PI * 2];
    const [l0, l1] = o.life ?? [0.6, 1.2];
    const [z0, z1] = o.size ?? [16, 32];
    const intensity = o.intensity ?? 1;
    for (let i = 0; i < count; i++) {
      const kind = pick(kinds);
      const additive = o.additive ?? (kind === PK.Glow || kind === PK.Twinkle);
      const a = rand(a0, a1), sp = rand(s0, s1);
      const c = new THREE.Color(pick(colors));
      const size = rand(z0, z1);
      const sr = o.spread ?? 0;
      const ang = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * sr;
      const p: P = {
        x: x + Math.cos(ang) * rr, y: y + Math.sin(ang) * rr, z: o.z ?? 300,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, max: rand(l0, l1), size, size1: size * (o.shrink ?? 0.2),
        r: c.r * intensity, g: c.g * intensity, b: c.b * intensity, a: 1,
        rot: rand(0, Math.PI * 2), vrot: rand(-1, 1) * (o.spin ?? 3), grav: o.gravity ?? 0, drag: o.drag ?? 0.97,
        kind, wobble: kind === PK.Bubble || kind === PK.Z || kind === PK.Heart ? rand(0, 6) : 0, flip: rand(4, 10),
      };
      (additive ? this.glow : this.normal).add(p);
    }
  }

  // ---- presets ----
  starBurst(x: number, y: number, scale = 1) {
    this.emit(x, y, { kind: PK.Twinkle, count: 14, speed: [150 * scale, 420 * scale], size: [20 * scale, 44 * scale], colors: GOLD, intensity: 1.6, life: [0.4, 0.8], drag: 0.9 });
    this.emit(x, y, { kind: PK.Star, count: 8, speed: [200 * scale, 500 * scale], size: [18 * scale, 34 * scale], colors: GOLD, life: [0.5, 0.9], drag: 0.92, gravity: 300, additive: false });
  }
  confetti(x: number, y: number, count = 40, power = 1) {
    this.emit(x, y, { kind: PK.Confetti, count, speed: [300 * power, 900 * power], angle: [Math.PI * 0.15, Math.PI * 0.85], size: [16, 28], life: [1.4, 2.4], gravity: 900, drag: 0.965, spin: 8, shrink: 0.9 });
  }
  fireworks(x: number, y: number) {
    const col = pick(CONFETTI);
    this.emit(x, y, { kind: PK.Twinkle, count: 36, speed: [250, 520], size: [18, 34], colors: [col, 0xffffff], intensity: 1.8, life: [0.7, 1.3], gravity: 160, drag: 0.94 });
    this.emit(x, y, { kind: PK.Glow, count: 1, speed: [0, 0], size: [260, 260], colors: [col], intensity: 1.2, life: [0.35, 0.35], shrink: 1.4 });
  }
  glitter(x: number, y: number, amount = 1) {
    this.emit(x, y, { kind: PK.Twinkle, count: Math.ceil(2 * amount), speed: [20, 120], size: [10, 26], colors: [0xffffff, 0xffe07a, 0xffc2dc, 0xc9b6ff], intensity: 1.5, life: [0.4, 0.9], gravity: -40, spread: 12 });
    if (Math.random() < 0.18 * amount) this.emit(x, y, { kind: PK.Bubble, count: 1, speed: [30, 90], angle: [Math.PI * 0.3, Math.PI * 0.7], size: [22, 44], colors: [0xffffff, 0xd9f2ff], life: [1.0, 1.6], gravity: -60, shrink: 1.1, additive: false });
    if (Math.random() < 0.08 * amount) this.emit(x, y, { kind: PK.Heart, count: 1, speed: [40, 110], angle: [Math.PI * 0.3, Math.PI * 0.7], size: [20, 34], colors: [0xff8fb1, 0xff6f9f, 0xb79cff], life: [0.9, 1.4], gravity: -80, shrink: 0.8, additive: false });
  }
  hearts(x: number, y: number, count = 8) {
    this.emit(x, y, { kind: PK.Heart, count, speed: [80, 260], angle: [Math.PI * 0.2, Math.PI * 0.8], size: [24, 44], colors: [0xff8fb1, 0xff6f9f, 0xb79cff, 0xffd34e], life: [1, 1.6], gravity: -100, shrink: 0.7, additive: false });
  }
  zzz(x: number, y: number) {
    this.emit(x, y, { kind: PK.Z, count: 1, speed: [40, 70], angle: [Math.PI * 0.35, Math.PI * 0.45], size: [26, 40], colors: [0xb79cff, 0x7ec8f2], life: [2, 2.6], gravity: -10, shrink: 1.8, spin: 0.4, additive: false });
  }
  notes(x: number, y: number, count = 3) {
    this.emit(x, y, { kind: PK.Note, count, speed: [60, 160], angle: [Math.PI * 0.25, Math.PI * 0.75], size: [34, 50], colors: [0xff8fb1, 0xb79cff, 0x7ec8f2], life: [1.2, 1.8], gravity: -40, shrink: 0.9, spin: 1, additive: false });
  }
  ambient(x0: number, x1: number, y0: number, y1: number) {
    this.emit(rand(x0, x1), rand(y0, y1), { kind: PK.Twinkle, count: 1, speed: [5, 30], size: [10, 24], colors: [0xffffff, 0xfff0b0], intensity: 1.3, life: [1.2, 2.4], gravity: -8, z: 50 });
  }

  update(dt: number) { this.normal.update(dt); this.glow.update(dt); }
  clear() { this.normal.clear(); this.glow.clear(); }
}
