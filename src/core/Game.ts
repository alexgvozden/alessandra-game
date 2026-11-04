import * as THREE from 'three';
import gsap from 'gsap';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { W, H, fitStage, CAM_Z } from './layout';
import { Particles } from '../gfx/particles';
import { flat } from '../gfx/materials';
import { tex } from './assets';
import { audio } from './audio';
import type { Screen, Clickable } from './Screen';

const FOV = 30;
const BG_Z = -600;

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    vignette: { value: 0.28 },
    iris: { value: 1.6 },
    irisCenter: { value: new THREE.Vector2(0.5, 0.5) },
    aspect: { value: W / H },
    irisColor: { value: new THREE.Color(0x3a2466) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float vignette; uniform float iris; uniform vec2 irisCenter; uniform float aspect; uniform vec3 irisColor;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = (vUv - 0.5) * vec2(aspect, 1.0);
      float v = smoothstep(0.55, 1.25, length(d) * 1.1);
      c.rgb *= 1.0 - v * vignette;
      // iris (star-ish wobble edge) transition
      vec2 q = (vUv - irisCenter) * vec2(aspect, 1.0);
      float ang = atan(q.y, q.x);
      float r = length(q) * (1.0 + 0.06 * sin(ang * 5.0));
      float m = smoothstep(iris, iris + 0.03, r);
      c.rgb = mix(c.rgb, irisColor, m);
      gl_FragColor = c;
    }`,
};

export class Game {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  final: ShaderPass;
  bloom: UnrealBloomPass;
  particles = new Particles();
  clock = new THREE.Timer();
  time = 0;

  screen: Screen | null = null;
  private screenReady = false;
  private transitioning = false;
  private raycaster = new THREE.Raycaster();
  private hovered: Clickable | null = null;
  pointer = new THREE.Vector2(0, 0); // world coords (z = 0 plane)
  pointerInside = false;
  lastInput = performance.now();
  inputLocked = false; // parent corner open
  onParentHold: ((progress: number) => void) | null = null;
  onParentOpen: (() => void) | null = null;

  private bgA: THREE.Mesh;
  private bgB: THREE.Mesh;
  private wand: THREE.Mesh;
  private wandTilt = 0;
  private pHoldStart = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setClearColor(0x3a2466);

    this.camera = new THREE.PerspectiveCamera(FOV, W / H, 10, 6000);
    this.camera.position.set(0, 0, CAM_Z);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;
    const hemi = new THREE.HemisphereLight(0xfff6e5, 0xb79cff, 0.32);
    const key = new THREE.DirectionalLight(0xffffff, 0.72);
    key.position.set(-600, 900, 1400);
    const fill = new THREE.DirectionalLight(0xffd6ec, 0.16);
    fill.position.set(900, -300, 800);
    this.scene.add(hemi, key, fill);

    // Two background planes for cross-fades.
    const bgScale = (CAM_Z - BG_Z) / CAM_Z;
    const mk = () => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(W * bgScale * 1.02, H * bgScale * 1.02), flat(null, { opacity: 0 }));
      m.position.z = BG_Z;
      m.renderOrder = -10;
      this.scene.add(m);
      return m;
    };
    this.bgA = mk();
    this.bgB = mk();

    const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.3, 0.45, 1.0);
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());

    this.scene.add(this.particles.group);

    const wandMat = flat(tex('sprites/wand.png'));
    wandMat.depthTest = false;
    this.wand = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wandMat);
    this.wand.renderOrder = 1000;
    // Hotspot = centre of the star (top-left of the sprite).
    this.wand.geometry.translate(0.5 - 0.34, -(0.5 - 0.3), 0);
    this.wand.scale.set(92, 109, 1);
    this.scene.add(this.wand);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindInput();
    if (new URLSearchParams(location.search).has('awake')) this.driveFromWorker();
    else this.renderer.setAnimationLoop(() => this.frame());
  }

  /**
   * Test mode (?awake): browsers pause requestAnimationFrame for hidden/occluded windows, which stalls
   * automated checks. A worker timer keeps the game loop and GSAP running regardless.
   */
  private driveFromWorker() {
    gsap.ticker.remove(gsap.updateRoot);
    const worker = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 16)'], { type: 'text/javascript' })));
    worker.onmessage = () => { gsap.updateRoot(performance.now() / 1000); this.frame(); };
  }

  // ---------------------------------------------------------------- layout

  resize() {
    const { w, h } = fitStage();
    // Cap the internal resolution to keep the post-processing affordable.
    const dpr = Math.min(window.devicePixelRatio || 1, 2, 2560 / w);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
  }

  /** Client (CSS px) -> world coords on the z=0 plane. */
  toWorld(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    const nx = ((clientX - r.left) / r.width) * 2 - 1;
    const ny = -(((clientY - r.top) / r.height) * 2 - 1);
    return new THREE.Vector2(nx * (W / 2), ny * (H / 2));
  }

  // ---------------------------------------------------------------- input

  private bindInput() {
    const c = this.canvas;
    c.addEventListener('pointermove', (e) => {
      const p = this.toWorld(e.clientX, e.clientY);
      const dx = p.x - this.pointer.x, dy = p.y - this.pointer.y;
      this.pointer.copy(p);
      this.pointerInside = true;
      this.touch();
      const speed = Math.hypot(dx, dy);
      if (speed > 2) this.particles.glitter(p.x, p.y, Math.min(2, speed / 25));
      this.wandTilt = THREE.MathUtils.clamp(dx * 0.01, -0.35, 0.35);
      if (!this.inputLocked && !this.transitioning) this.screen?.onPointerMove(p.x, p.y, dx, dy);
      this.updateHover();
    });
    c.addEventListener('pointerleave', () => { this.pointerInside = false; });
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture?.(e.pointerId);
      const p = this.toWorld(e.clientX, e.clientY);
      this.pointer.copy(p);
      this.pointerInside = true;
      this.touch();
      audio.startMusic();
      if (this.inputLocked || this.transitioning) return;
      this.particles.starBurst(p.x, p.y, 0.5);
      const hit = this.pick();
      if (hit) {
        const t = hit.hoverTarget ?? hit.object;
        gsap.fromTo(t.scale, { x: t.userData.baseScale?.x * 0.88 || 0.88, y: t.userData.baseScale?.y * 0.88 || 0.88 }, { x: t.userData.baseScale?.x ?? 1, y: t.userData.baseScale?.y ?? 1, duration: 0.45, ease: 'elastic.out(1.2,0.4)' });
        if (hit.sound !== false) audio.play('click');
        hit.onClick();
        return;
      }
      this.screen?.onPointerDown(p.x, p.y);
    });
    window.addEventListener('pointerup', () => { if (!this.inputLocked) this.screen?.onPointerUp(); });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
    window.addEventListener('dragstart', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (this.inputLocked) return; // the parent corner handles its own keys
      if (['F5', 'F11', 'F12'].includes(e.key)) return;
      e.preventDefault(); // blocks Backspace navigation, space scrolling, Tab focus, quick-find...
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'p' || e.key === 'P') { if (!e.repeat) this.pHoldStart = performance.now(); }
      if (e.repeat) return;
      this.touch();
      audio.startMusic();
      if (this.transitioning) return;
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      this.screen?.onKey(key);
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'p' || e.key === 'P') { this.pHoldStart = 0; this.onParentHold?.(0); }
    });
    window.addEventListener('blur', () => { this.pHoldStart = 0; this.onParentHold?.(0); });
  }

  touch() { this.lastInput = performance.now(); }

  get idleSeconds() { return (performance.now() - this.lastInput) / 1000; }

  private pick(): Clickable | null {
    if (!this.screen || !this.pointerInside) return null;
    const ndc = new THREE.Vector2(this.pointer.x / (W / 2), this.pointer.y / (H / 2));
    this.raycaster.setFromCamera(ndc, this.camera);
    let best: Clickable | null = null;
    let bestDist = Infinity;
    for (const c of this.screen.clickables) {
      if (c.enabled && !c.enabled()) continue;
      if (!c.object.visible || !isVisible(c.object)) continue;
      const hits = this.raycaster.intersectObject(c.object, true);
      if (hits.length && hits[0].distance < bestDist) { best = c; bestDist = hits[0].distance; }
    }
    return best;
  }

  private updateHover() {
    const hit = this.transitioning || this.inputLocked ? null : this.pick();
    if (hit === this.hovered) return;
    const setScale = (c: Clickable | null, k: number) => {
      if (!c) return;
      const t = c.hoverTarget ?? c.object;
      if (!t.userData.baseScale) t.userData.baseScale = t.scale.clone();
      const b = t.userData.baseScale as THREE.Vector3;
      gsap.to(t.scale, { x: b.x * k, y: b.y * k, z: b.z * k, duration: 0.25, ease: 'back.out(3)' });
    };
    setScale(this.hovered, 1);
    setScale(hit, 1.09);
    this.hovered = hit;
  }

  // ---------------------------------------------------------------- screens

  setBackground(bg: string | THREE.Texture | null, fade = 0.5) {
    const t = bg === null ? null : typeof bg === 'string' ? tex(bg) : bg;
    const [from, to] = [this.bgA, this.bgB];
    const toMat = to.material as THREE.MeshBasicMaterial;
    const fromMat = from.material as THREE.MeshBasicMaterial;
    if (fromMat.map === t && fromMat.opacity > 0) return;
    toMat.map = t;
    toMat.needsUpdate = true;
    toMat.opacity = 0;
    to.renderOrder = -9;
    from.renderOrder = -10;
    gsap.to(toMat, { opacity: t ? 1 : 0, duration: fade });
    gsap.to(fromMat, { opacity: 0, duration: fade, delay: fade * 0.5 });
    this.bgA = to;
    this.bgB = from;
  }

  async go(next: Screen, opts: { instant?: boolean } = {}) {
    if (this.transitioning) return;
    this.transitioning = true;
    this.hovered = null;
    const u = this.final.uniforms;
    u.irisCenter.value.set(0.5 + this.pointer.x / W, 0.5 + this.pointer.y / H);
    if (this.screen && !opts.instant) {
      audio.play('whoosh', { volume: 0.6 });
      await new Promise<void>((r) => gsap.to(u.iris, { value: 0, duration: 0.45, ease: 'power2.in', onComplete: r }));
    }
    if (this.screen) {
      this.screen.exit();
      this.scene.remove(this.screen.root);
      gsap.killTweensOf(this.screen.root);
    }
    this.particles.clear();
    this.screen = next;
    this.screenReady = false; // don't update a screen while its enter() is still building it
    this.scene.add(next.root);
    if (next.background) this.setBackground(next.background, 0.01);
    try {
      await next.enter();
    } catch (err) {
      console.error('[game] screen failed to start', err);
    }
    this.screenReady = true;
    u.irisCenter.value.set(0.5, 0.5);
    await new Promise<void>((r) => gsap.fromTo(u.iris, { value: 0 }, { value: 1.6, duration: 0.6, ease: 'power2.out', onComplete: r }));
    this.transitioning = false;
    this.updateHover();
  }

  // ---------------------------------------------------------------- loop

  private frame() {
    this.clock.update();
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    if (this.pHoldStart && !this.inputLocked) {
      const p = (performance.now() - this.pHoldStart) / 3000;
      this.onParentHold?.(Math.min(1, p));
      if (p >= 1) { this.pHoldStart = 0; this.onParentHold?.(0); this.onParentOpen?.(); }
    }
    // A thrown error must never stop the loop: requestAnimationFrame would not be rescheduled
    // and the game would freeze on its last frame.
    try {
      if (this.screenReady) this.screen?.update(dt, this.time);
    } catch (err) {
      this.reportFrameError(err);
    }
    this.particles.update(dt);

    this.wand.visible = this.pointerInside && !this.inputLocked;
    this.wand.position.set(this.pointer.x, this.pointer.y, 0);
    this.wand.rotation.z += (-this.wandTilt - this.wand.rotation.z) * 0.15;
    this.wandTilt *= 0.9;

    try {
      this.composer.render(dt);
    } catch (err) {
      this.reportFrameError(err);
    }
  }

  private frameErrors = 0;
  private reportFrameError(err: unknown) {
    if (this.frameErrors++ < 5) console.error('[game] frame error', err);
  }
}

function isVisible(o: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = o;
  while (p) { if (!p.visible) return false; p = p.parent; }
  return true;
}
