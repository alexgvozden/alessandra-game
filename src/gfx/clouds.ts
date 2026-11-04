import * as THREE from 'three';

const MASK_W = 512, MASK_H = 288;
const SMALL_W = 64, SMALL_H = 36;

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v;
  }`;

/**
 * Magic clouds over the picture. A reveal mask (render target) stores how much is uncovered:
 * the subject reveal (radial, grows while typing) and the wand brush both draw into it with MAX blending.
 */
export class CloudCover {
  mesh: THREE.Mesh;
  private maskRT: THREE.WebGLRenderTarget;
  private smallRT: THREE.WebGLRenderTarget;
  private maskScene = new THREE.Scene();
  private maskCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  private brush: THREE.Mesh;
  private brushMat: THREE.ShaderMaterial;
  private copyScene = new THREE.Scene();
  private stamps: { u: number; v: number; r: number; s: number }[] = [];
  private pixels = new Uint8Array(SMALL_W * SMALL_H * 4);
  private dirty = true;
  private needsClear = true;
  readonly aspect: number;
  mat: THREE.ShaderMaterial;
  revealed = 0;

  constructor(private renderer: THREE.WebGLRenderer, public width: number, public height: number, cloudTex: THREE.Texture) {
    this.aspect = width / height;
    const rtOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false };
    this.maskRT = new THREE.WebGLRenderTarget(MASK_W, MASK_H, rtOpts);
    this.smallRT = new THREE.WebGLRenderTarget(SMALL_W, SMALL_H, rtOpts);

    this.brushMat = new THREE.ShaderMaterial({
      uniforms: { strength: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float strength; varying vec2 vUv;
        void main(){ float d = length(vUv - 0.5) * 2.0; float a = (1.0 - smoothstep(0.35, 1.0, d)) * strength; gl_FragColor = vec4(a, a, a, 1.0); }`,
      blending: THREE.CustomBlending,
      blendEquation: THREE.MaxEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      depthTest: false, depthWrite: false,
    });
    this.brush = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.brushMat);
    this.maskScene.add(this.brush);

    const copy = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { t: { value: this.maskRT.texture } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `uniform sampler2D t; varying vec2 vUv; void main(){
        vec2 px = vec2(1.0/${MASK_W}.0, 1.0/${MASK_H}.0) * 2.5;
        float v = texture2D(t, vUv).r + texture2D(t, vUv + px).r + texture2D(t, vUv - px).r + texture2D(t, vUv + vec2(px.x, -px.y)).r + texture2D(t, vUv + vec2(-px.x, px.y)).r;
        gl_FragColor = vec4(v / 5.0, 0.0, 0.0, 1.0); }`,
      depthTest: false,
    }));
    copy.frustumCulled = false;
    this.copyScene.add(copy);

    cloudTex.wrapS = cloudTex.wrapT = THREE.MirroredRepeatWrapping;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tMask: { value: this.maskRT.texture },
        tClouds: { value: cloudTex },
        time: { value: 0 },
        melt: { value: 0 },
        aspect: { value: this.aspect },
        opacity: { value: 1 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tMask; uniform sampler2D tClouds;
        uniform float time; uniform float melt; uniform float aspect; uniform float opacity;
        varying vec2 vUv;
        ${NOISE}
        void main() {
          vec2 p = vUv * vec2(aspect, 1.0);
          float n = fbm(p * 2.2 + vec2(time * 0.03, -time * 0.02));
          vec2 drift = vec2(sin(time * 0.11 + vUv.y * 3.0), cos(time * 0.09 + vUv.x * 2.0)) * 0.012 + (n - 0.5) * 0.03;
          vec3 col = texture2D(tClouds, vUv * 0.94 + 0.03 + drift + vec2(time * 0.004, 0.0)).rgb;
          // soft breathing brightness
          col *= 0.97 + 0.06 * fbm(p * 3.0 + time * 0.07);

          float m = texture2D(tMask, vUv).r;
          float e = fbm(p * 7.0 + vec2(time * 0.15, time * 0.1));
          float v = m + (e - 0.5) * 0.45 + melt * 1.6;
          float cover = 1.0 - smoothstep(0.42, 0.62, v);
          // puffy darker lip just inside the cloud edge, then a golden glow at the edge
          float lip = smoothstep(0.2, 0.42, v) * cover;
          col = mix(col, col * 0.86, lip * 0.6);
          float rim = smoothstep(0.38, 0.52, v) * (1.0 - smoothstep(0.52, 0.64, v));
          vec3 glow = vec3(1.0, 0.82, 0.45) * rim * (1.0 - melt);
          float a = clamp(cover + rim * 0.35 * (1.0 - melt), 0.0, 1.0);
          gl_FragColor = vec4(col * cover + glow * 1.25, a * opacity);
        }`,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.mat);
  }

  /** Paint a soft circle at picture uv (0..1). radius is in picture-height units. */
  paint(u: number, v: number, radius: number, strength = 1) {
    this.stamps.push({ u, v, r: radius, s: strength });
  }

  /** Paint along a segment so fast strokes stay continuous. */
  stroke(u0: number, v0: number, u1: number, v1: number, radius: number) {
    const dx = (u1 - u0) * this.aspect, dy = v1 - v0;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(len / (radius * 0.3)));
    for (let i = 1; i <= steps; i++) this.paint(u0 + (u1 - u0) * (i / steps), v0 + (v1 - v0) * (i / steps), radius);
  }

  reset() {
    this.needsClear = true;
    this.stamps.length = 0;
    this.revealed = 0;
    this.mat.uniforms.melt.value = 0;
    this.dirty = true;
  }

  update(time: number) {
    this.mat.uniforms.time.value = time;
    if (!this.needsClear && !this.stamps.length) return;
    const r = this.renderer;
    const prevRT = r.getRenderTarget();
    const prevAuto = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(this.maskRT);
    if (this.needsClear) {
      r.setClearColor(0x000000, 1);
      r.clear(true, false, false);
      this.needsClear = false;
    }
    for (const s of this.stamps) {
      this.brush.position.set(s.u, s.v, 0);
      this.brush.scale.set((s.r * 2) / this.aspect, s.r * 2, 1);
      this.brushMat.uniforms.strength.value = s.s;
      r.render(this.maskScene, this.maskCam);
    }
    this.stamps.length = 0;
    r.setRenderTarget(prevRT);
    r.autoClear = prevAuto;
    this.dirty = true;
  }

  /** Downsample + read back the mask (call a few times per second). Returns uncovered fraction. */
  sample(): number {
    if (!this.dirty) return this.revealed;
    const r = this.renderer;
    const prevRT = r.getRenderTarget();
    r.setRenderTarget(this.smallRT);
    r.render(this.copyScene, this.maskCam);
    r.readRenderTargetPixels(this.smallRT, 0, 0, SMALL_W, SMALL_H, this.pixels);
    r.setRenderTarget(prevRT);
    let sum = 0;
    for (let i = 0; i < SMALL_W * SMALL_H; i++) sum += this.pixels[i * 4] > 120 ? 1 : this.pixels[i * 4] / 255 * 0.5;
    this.revealed = sum / (SMALL_W * SMALL_H);
    this.dirty = false;
    return this.revealed;
  }

  /** Mask value (0..1) at picture uv, from the last sample(). */
  valueAt(u: number, v: number): number {
    const x = Math.min(SMALL_W - 1, Math.max(0, Math.floor(u * SMALL_W)));
    const y = Math.min(SMALL_H - 1, Math.max(0, Math.floor(v * SMALL_H)));
    return this.pixels[(y * SMALL_W + x) * 4] / 255;
  }

  dispose() {
    this.maskRT.dispose();
    this.smallRT.dispose();
    this.mat.dispose();
    (this.mesh.geometry as THREE.BufferGeometry).dispose();
  }
}
