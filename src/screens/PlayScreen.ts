import * as THREE from 'three';
import gsap from 'gsap';
import { Screen } from '../core/Screen';
import type { Game } from '../core/Game';
import { px, setPx, PALETTE, CANDY, clamp, pick } from '../core/layout';
import { audio } from '../core/audio';
import { save } from '../core/save';
import { tex, loadTex } from '../core/assets';
import { type Level, worldOf, levelVoices } from '../data/levels';
import { nextLevel } from '../core/progress';
import { CandyLetter, CandyWord } from '../gfx/letters';
import { candy, candyOwn, flat } from '../gfx/materials';
import { frameGeometry, puffySlab, starGeometry, roundedPlane } from '../gfx/shapes';
import { CloudCover } from '../gfx/clouds';
import { gradientTexture, pageTexture } from '../gfx/canvasTex';
import { PK, GOLD } from '../gfx/particles';
import { RoundButton } from '../ui/Button';
import { Pip } from '../ui/Pip';

const PW = 1000, PH = 562.5; // picture size in the typing layout
const R0 = 0.1; // first peek through the clouds
const RMAX = 0.5; // reveal brush radius that uncovers the whole subject
const BRUSH = 0.16; // wand brush radius (picture-height units)
const DONE_AT = 0.85; // share of the picture uncovered before the rest melts away
const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

type Phase = 'intro' | 'typing' | 'wordDone' | 'uncover' | 'melting' | 'complete';

interface Key { group: THREE.Group; body: THREE.Mesh; glow: THREE.Mesh; mat: THREE.MeshPhysicalMaterial; base: THREE.Color }
interface Slot { group: THREE.Group; letter: CandyLetter | null }
interface Popper { def: Level['surprises'][number]; mesh: THREE.Mesh; popped: boolean }

export class PlayScreen extends Screen {
  background = gradientTexture([[0, '#a58af0'], [1, '#6c4cc2']]);
  private phase: Phase = 'intro';
  private word: string;
  private typed = 0;

  // scene parts
  private cover!: THREE.Group;
  private page!: THREE.Group;
  private frame = new THREE.Group();
  private frameMat = candyOwn(0x8fd0f7, 0.4);
  private clouds!: CloudCover;
  private poppers: Popper[] = [];
  private tiles: CandyLetter[] = [];
  private slots: Slot[] = [];
  private underline = new THREE.Group();
  private keys = new Map<string, Key>();
  private typingUI = new THREE.Group();
  private keyboard = new THREE.Group();
  private pip!: Pip;
  private pipBubble!: RoundButton;
  private home!: RoundButton;
  private badge!: RoundButton;
  private progressBar!: THREE.Group;
  private progressFill!: THREE.ShaderMaterial;
  private progressStar!: THREE.Mesh;
  private ribbon!: THREE.Group;
  private hand!: THREE.Mesh;
  private handTween: gsap.core.Timeline | null = null;

  // state
  private reveal = { r: 0 };
  private lastR = -1;
  private lastCorrectAt = performance.now();
  private wrongSinceCorrect = false;
  private asked = false;
  private idleAsked = false;
  private lastUV: THREE.Vector2 | null = null;
  private rubLevel = 0;
  private lastRubAt = 0;
  private sampleT = 0;
  private startCoverage = 0;
  private shownProgress = 0;
  private saidAlmost = false;
  private completeUI: THREE.Object3D[] = [];
  private fireworksUntil = 0;

  constructor(game: Game, private level: Level) {
    super(game);
    this.word = level.word;
  }

  private get hintMode() {
    const s = save.data.settings.hint;
    return s === 'auto' ? worldOf(this.level).hint : s;
  }

  // ======================================================================= build

  async enter() {
    const g = this.game;
    const picTex = await loadTex(`scenes/${this.level.id}.jpg`);
    audio.preloadVoices(levelVoices(this.level));

    // Book cover + cream page
    this.cover = new THREE.Group();
    const coverSlab = new THREE.Mesh(puffySlab(1890, 1060, 70, 30, 14), candy(0x9a7ee8, { rough: 0.5 }));
    coverSlab.position.z = -90;
    this.page = new THREE.Group();
    const pageMat = new THREE.MeshPhysicalMaterial({ map: pageTexture(), roughness: 0.7, clearcoat: 0.3, clearcoatRoughness: 0.4 });
    const pageSlab = new THREE.Mesh(puffySlab(1830, 1010, 56, 24, 12), pageMat);
    pageSlab.position.z = -60;
    this.page.add(pageSlab);
    this.cover.add(coverSlab, this.page);
    setPx(this.cover, 960, 540, 0);
    this.root.add(this.cover);

    // Picture window: picture, clouds, surprises, blue frame with gold rim.
    const picture = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({ map: picTex, toneMapped: false }));
    this.clouds = new CloudCover(g.renderer, PW, PH, tex('bg/clouds.jpg'));
    this.clouds.mesh.position.z = 2;
    this.clouds.mesh.renderOrder = 2;
    const frameMesh = new THREE.Mesh(frameGeometry(PW + 150, PH + 140, 92, PW, PH, 44, 26, 16), this.frameMat);
    frameMesh.position.z = 22;
    const rim = new THREE.Mesh(frameGeometry(PW + 30, PH + 30, 58, PW, PH, 44, 6, 6), candy(PALETTE.gold, { rough: 0.25 }));
    rim.position.z = 30;
    this.frame.add(picture, this.clouds.mesh, frameMesh, rim);
    // little embossed stars on the frame corners
    for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const s = new THREE.Mesh(starGeometry(18), candy(0xc4e6ff));
      s.position.set(sx * (PW / 2 + 40), sy * (PH / 2 + 36), 44);
      this.frame.add(s);
    }
    for (const def of this.level.surprises) {
      const mat = flat(tex(`sprites/${def.sprite}.png`));
      const img = mat.map!.image as HTMLImageElement | undefined;
      const aspect = img && img.height ? img.width / img.height : 1;
      const h = def.size * PH;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(h * aspect, h), mat);
      mesh.position.set((def.u - 0.5) * PW, (def.v - 0.5) * PH, 8);
      mesh.scale.setScalar(0.001);
      mesh.visible = false;
      mesh.renderOrder = 4;
      this.frame.add(mesh);
      const p: Popper = { def, mesh, popped: false };
      this.poppers.push(p);
      this.clickable(mesh, () => this.poke(p), { enabled: () => p.popped, sound: false });
    }
    setPx(this.frame, 960, 330, 0);
    this.root.add(this.frame);
    this.clickable(picture, () => { if (this.phase === 'typing') audio.say('ask_' + this.level.id); }, { sound: false, enabled: () => this.phase === 'typing', hoverTarget: new THREE.Object3D() });

    this.buildTyping();
    this.buildUncoverUI();

    // Corner buttons and Pip
    this.home = new RoundButton(55, PALETTE.sky, 'home');
    setPx(this.home, 85, 85, 60);
    this.root.add(this.home);
    this.clickable(this.home, () => this.toMap(), { hoverTarget: this.home });

    this.badge = new RoundButton(55, worldOf(this.level).color, { sprite: `world_${this.level.world}`, scale: 0.9 });
    setPx(this.badge, 85, 215, 60);
    this.root.add(this.badge);
    this.clickable(this.badge, () => audio.say('ask_' + this.level.id), { hoverTarget: this.badge, sound: false });

    this.pip = new Pip(185, g.particles);
    setPx(this.pip, 1745, 1000, 70);
    this.pip.setBase(this.hintMode === 'point' ? 'point' : 'idle');
    this.root.add(this.pip);
    this.clickable(this.pip, () => this.askHelp(), { hoverTarget: this.pip, sound: false });

    this.pipBubble = new RoundButton(34, PALETTE.pink, 'help', { rim: PALETTE.cream, iconScale: 1.3 });
    setPx(this.pipBubble, 1830, 650, 90);
    this.pipBubble.visible = this.hintMode === 'ask';
    this.root.add(this.pipBubble);
    this.pipBubble.pulse(0.1, 1);
    this.clickable(this.pipBubble, () => this.askHelp(), { hoverTarget: this.pipBubble, sound: false });

    // Intro animation
    this.clouds.paint(0.5, 0.5, 0.001);
    gsap.from(this.frame.position, { y: this.frame.position.y + 700, duration: 0.9, ease: 'back.out(1.2)' });
    this.tiles.forEach((t, i) => { t.scale.setScalar(0.001); gsap.to(t.scale, { x: 1, y: 1, z: 1, duration: 0.6, delay: 0.5 + i * 0.08, ease: 'back.out(3)' }); });
    this.slots.forEach((s, i) => { s.group.scale.setScalar(0.001); gsap.to(s.group.scale, { x: 1, y: 1, z: 1, duration: 0.5, delay: 0.6 + i * 0.06, ease: 'back.out(2)' }); });
    gsap.from(this.keyboard.position, { y: this.keyboard.position.y - 300, duration: 0.8, delay: 0.3, ease: 'back.out(1.3)' });
    gsap.to(this.reveal, { r: R0, duration: 1.2, delay: 0.8, ease: 'power2.out' });
    gsap.delayedCall(1.1, () => {
      this.phase = 'typing';
      this.lastCorrectAt = performance.now();
      this.updateTargets();
      audio.say('ask_' + this.level.id);
    });
  }

  private buildTyping() {
    const n = this.word.length;
    const pitch = Math.min(132, 1150 / n);
    const size = n <= 6 ? 96 : 84;
    [...this.word].forEach((ch, i) => {
      const x = 960 + (i - (n - 1) / 2) * pitch;
      const t = new CandyLetter(ch, size, { color: PALETTE.cream, outline: PALETTE.outline });
      setPx(t, x, 702, 60);
      this.typingUI.add(t);
      this.tiles.push(t);

      const slot = new THREE.Group();
      const w = Math.min(112, pitch - 14);
      const bg = new THREE.Mesh(puffySlab(w, w * 1.06, 26, 4, 7), candy(0xf1dfbf, { rough: 0.8 }));
      const inner = new THREE.Mesh(puffySlab(w - 16, w * 1.06 - 16, 20, 2, 4), candy(0xe9d3ad, { rough: 0.9 }));
      inner.position.z = 4;
      slot.add(bg, inner);
      setPx(slot, x, 835, 10);
      this.typingUI.add(slot);
      this.slots.push({ group: slot, letter: null });
    });
    // pink dotted underline under the active slot
    const dash = (w: number, x: number) => {
      const m = new THREE.Mesh(puffySlab(w, 12, 6, 2, 3), candy(PALETTE.pink));
      m.position.x = x;
      this.underline.add(m);
    };
    dash(16, -30); dash(34, 0); dash(16, 30);
    this.typingUI.add(this.underline);

    // keyboard strip
    const plate = new THREE.Mesh(puffySlab(690, 196, 40, 10, 10), candy(0xffe6a8, { rough: 0.5 }));
    plate.position.set(0, 0, -16);
    this.keyboard.add(plate);
    ROWS.forEach((row, r) => {
      [...row].forEach((ch, i) => {
        const x = (i - 4.5) * 62 + r * 24;
        const y = 60 - r * 60;
        const group = new THREE.Group();
        const base = new THREE.Color(CANDY[(i + r * 2) % CANDY.length]);
        const mat = candyOwn(base);
        const body = new THREE.Mesh(puffySlab(54, 52, 15, 6, 6), mat);
        const label = new CandyLetter(ch, 28, { color: 0xffffff, outline: null });
        label.position.z = 12;
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffd34e, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        glow.position.z = 2;
        glow.visible = false;
        group.add(glow, body, label);
        group.position.set(x, y, 0);
        this.keyboard.add(group);
        this.keys.set(ch, { group, body, glow, mat, base });
        this.clickable(body, () => this.onKey(ch), { hoverTarget: group, sound: false, enabled: () => this.phase === 'typing' });
      });
    });
    setPx(this.keyboard, 960, 978, 20);
    this.typingUI.add(this.keyboard);
    this.root.add(this.typingUI);
  }

  private buildUncoverUI() {
    // rainbow progress bar
    this.progressBar = new THREE.Group();
    const track = new THREE.Mesh(puffySlab(720, 60, 30, 10, 8), candy(0x8f6fe0, { rough: 0.5 }));
    this.progressFill = new THREE.ShaderMaterial({
      uniforms: { p: { value: 0 }, t: { value: 0 } },
      transparent: true,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float p; uniform float t; varying vec2 vUv;
        float sdRound(vec2 q, vec2 b, float r){ vec2 d = abs(q) - b + r; return length(max(d,0.0)) - r; }
        void main(){
          vec2 q = (vUv - 0.5) * vec2(680.0, 40.0);
          float d = sdRound(q, vec2(340.0, 20.0), 20.0);
          float fillX = -340.0 + 680.0 * p;
          float inFill = step(q.x, fillX);
          float a = (1.0 - smoothstep(-1.0, 1.0, d)) * inFill * step(0.001, p);
          vec3 rb = 0.55 + 0.45 * cos(6.2831 * (vUv.x * 0.9 + vec3(0.0, 0.33, 0.67)));
          rb = mix(rb, vec3(1.0), 0.25);
          float shine = smoothstep(0.55, 0.9, vUv.y) * 0.35 + 0.08 * sin(vUv.x * 60.0 - t * 6.0);
          gl_FragColor = vec4(rb + shine, a);
          #include <colorspace_fragment>
        }`,
    });
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(680, 40), this.progressFill);
    fill.position.z = 16;
    this.progressStar = new THREE.Mesh(starGeometry(46), candyOwn(PALETTE.yellow));
    this.progressStar.position.set(372, 0, 30);
    this.progressBar.add(track, fill, this.progressStar);
    setPx(this.progressBar, 960, 64, 110);
    this.progressBar.visible = false;
    this.root.add(this.progressBar);

    // golden ribbon with the word
    this.ribbon = new THREE.Group();
    const band = new THREE.Mesh(puffySlab(Math.max(360, this.word.length * 70 + 120), 104, 40, 10, 10), candy(PALETTE.gold, { rough: 0.3 }));
    const w = new CandyWord(this.word, 62, () => PALETTE.cream, { outline: PALETTE.outline });
    w.position.z = 20;
    this.ribbon.add(band, w);
    setPx(this.ribbon, 960, 995, 110);
    this.ribbon.visible = false;
    this.root.add(this.ribbon);

    this.hand = new THREE.Mesh(new THREE.PlaneGeometry(250, 235), flat(tex('sprites/hand.png')));
    this.hand.renderOrder = 50;
    this.hand.visible = false;
    this.root.add(this.hand);
  }

  // ======================================================================= typing

  onKey(key: string) {
    if (this.phase === 'complete') {
      if (key === 'Enter' || key === ' ') this.next();
      return;
    }
    if (this.phase !== 'typing' || !/^[A-Z]$/.test(key)) return;
    this.pip.wake();
    this.idleAsked = false;
    const target = this.word[this.typed];
    this.flashKey(key);
    if (key === target) this.correct(key);
    else this.wrong();
  }

  private flashKey(ch: string) {
    const k = this.keys.get(ch);
    if (!k) return;
    gsap.fromTo(k.group.position, { z: -12 }, { z: 0, duration: 0.3, ease: 'back.out(3)' });
  }

  private correct(ch: string) {
    const i = this.typed++;
    const slot = this.slots[i];
    const n = this.word.length;
    this.lastCorrectAt = performance.now();
    this.wrongSinceCorrect = false;
    this.asked = false;

    const letter = new CandyLetter(ch, 84, { material: candyOwn(CANDY[i % CANDY.length], 0.25), outline: PALETTE.outline });
    slot.letter = letter;
    const keyPos = this.keys.get(ch)!.group.getWorldPosition(new THREE.Vector3());
    const end = slot.group.position.clone().setZ(40);
    this.typingUI.add(letter);
    letter.position.copy(keyPos).setZ(80);
    letter.scale.setScalar(0.5);
    const start = letter.position.clone();
    const arc = { t: 0 };
    gsap.to(letter.scale, { x: 1, y: 1, z: 1, duration: 0.32 });
    gsap.to(arc, {
      t: 1, duration: 0.32, ease: 'power1.in',
      onUpdate: () => {
        letter.position.lerpVectors(start, end, arc.t);
        letter.position.y += Math.sin(arc.t * Math.PI) * 180;
        letter.body.rotation.z = (1 - arc.t) * 0.8;
      },
      onComplete: () => {
        audio.play('thock', { volume: 0.7 });
        gsap.fromTo(letter.body.scale, { x: 1.4, y: 0.55 }, { x: 1, y: 1, duration: 0.7, ease: 'elastic.out(1.3,0.35)' });
        this.game.particles.starBurst(end.x, end.y, 0.9);
        this.game.particles.confetti(end.x, end.y + 20, 14, 0.6);
      },
    });

    audio.play('pop', { rate: 1 + i * 0.07 });
    audio.say('letter_' + ch.toLowerCase());
    if (i < n - 1) this.pip.cheer();

    // the tile above turns to candy colour and settles
    const tile = this.tiles[i];
    tile.setMaterial(candy(CANDY[i % CANDY.length]));
    gsap.killTweensOf(tile.body.scale);
    gsap.to(tile.body.scale, { x: 1, y: 1, z: 1, duration: 0.2 });
    gsap.fromTo(tile.body.position, { y: 30 }, { y: 0, duration: 0.5, ease: 'bounce.out' });

    // clouds part a little more
    const r = R0 + (RMAX - R0) * ((i + 1) / n);
    gsap.to(this.reveal, { r, duration: 0.7, ease: 'power2.out' });
    this.sparkleRing(r * 0.6);

    if (this.typed === n) gsap.delayedCall(0.45, () => this.wordComplete());
    else this.updateTargets();
  }

  private wrong() {
    audio.play('boop');
    this.wrongSinceCorrect = true;
    const tile = this.tiles[this.typed], slot = this.slots[this.typed];
    gsap.fromTo(tile.body.rotation, { z: 0.3 }, { z: 0, duration: 0.7, ease: 'elastic.out(1.4,0.25)' });
    gsap.fromTo(slot.group.rotation, { z: -0.12 }, { z: 0, duration: 0.6, ease: 'elastic.out(1.4,0.25)' });
    this.pip.think();
  }

  private askHelp() {
    if (this.phase !== 'typing') { this.pip.cheer(); audio.say(pick(['say_wow', 'say_super', 'say_great'])); return; }
    this.asked = true;
    this.pip.show('point', 2.5);
    audio.sequence(['say_help', 'letter_' + this.word[this.typed].toLowerCase()]);
  }

  /** Pulse the next tile, move the underline, and (depending on hint mode) glow the key. */
  private updateTargets() {
    const i = this.typed;
    this.tiles.forEach((t, k) => {
      if (k === i) {
        t.setMaterial(candy(PALETTE.yellow));
        gsap.fromTo(t.body.scale, { x: 1, y: 1 }, { x: 1.15, y: 1.15, duration: 0.45, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      }
    });
    const s = this.slots[i];
    if (s) gsap.to(this.underline.position, { x: s.group.position.x, y: s.group.position.y - 38, z: 24, duration: 0.3, ease: 'back.out(2)' });
  }

  private hintOn(): boolean {
    if (this.phase !== 'typing') return false;
    switch (this.hintMode) {
      case 'point':
      case 'always': return true;
      case 'delay': return performance.now() - this.lastCorrectAt > 3000;
      case 'wrong': return this.wrongSinceCorrect || this.asked;
      case 'ask': return this.asked;
    }
  }

  private sparkleRing(r: number) {
    const c = this.frame.getWorldPosition(new THREE.Vector3());
    const s = this.frame.scale.x;
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      this.game.particles.emit(c.x + Math.cos(a) * r * PH * s, c.y + Math.sin(a) * r * PH * s, { kind: PK.Twinkle, count: 1, speed: [20, 80], size: [16, 30], colors: GOLD, intensity: 1.8, life: [0.5, 0.9] });
    }
  }

  // ======================================================================= word complete

  private async wordComplete() {
    this.phase = 'wordDone';
    this.keys.forEach((k) => (k.glow.visible = false));
    this.underline.visible = false;
    audio.play('magic');
    gsap.to(this.reveal, { r: RMAX * 1.12, duration: 0.8, ease: 'power2.out' });
    this.pip.cheer();

    // Mexican wave + rainbow shimmer
    this.slots.forEach((s, i) => {
      const l = s.letter!;
      gsap.to(l.body.position, { y: 55, duration: 0.22, delay: i * 0.09, yoyo: true, repeat: 3, ease: 'power2.out' });
      const mat = l.fill.material as THREE.MeshPhysicalMaterial;
      const hue = { h: i / this.slots.length };
      gsap.to(hue, {
        h: hue.h + 2, duration: 1.6, delay: i * 0.09, ease: 'none',
        onUpdate: () => mat.emissive.setHSL(hue.h % 1, 0.9, 0.35),
        onComplete: () => mat.emissive.set(0x000000),
      });
      const p = s.group.position;
      gsap.delayedCall(i * 0.09, () => this.game.particles.starBurst(p.x, p.y + 30, 0.8));
    });
    this.tiles.forEach((t, i) => gsap.to(t.body.position, { y: 40, duration: 0.22, delay: 0.1 + i * 0.09, yoyo: true, repeat: 3 }));
    const c = this.frame.getWorldPosition(new THREE.Vector3());
    this.game.particles.fireworks(c.x - 200, c.y + 120);
    gsap.delayedCall(0.3, () => this.game.particles.fireworks(c.x + 220, c.y + 80));
    this.game.particles.confetti(c.x, c.y - 350, 50, 1);

    await wait(0.5);
    await timeout(audio.say('word_' + this.level.id), 2500);
    this.game.particles.notes(c.x + 60, c.y + 120, 4);
    await timeout(audio.say('sound_' + this.level.id), 5500);
    await wait(0.2);
    this.startUncover();
  }

  // ======================================================================= uncover

  private startUncover() {
    this.phase = 'uncover';
    this.startCoverage = this.clouds.sample();
    gsap.to(this.typingUI.position, { y: -700, duration: 0.8, ease: 'back.in(1.2)', onComplete: () => { this.typingUI.visible = false; } });
    gsap.to(this.badge.scale, { x: 0.001, y: 0.001, duration: 0.3 });
    gsap.to(this.pipBubble.scale, { x: 0.001, y: 0.001, duration: 0.3 });
    const target = px(960, 522);
    gsap.to(this.frame.position, { x: target.x, y: target.y, duration: 1, ease: 'power2.inOut' });
    gsap.to(this.frame.scale, { x: 1.4, y: 1.4, z: 1.4, duration: 1, ease: 'power2.inOut' });
    const pipTo = px(1825, 1035, 100);
    gsap.to(this.pip.position, { x: pipTo.x, y: pipTo.y, z: pipTo.z, duration: 1, ease: 'power2.inOut' });
    gsap.to(this.pip.scale, { x: 0.7, y: 0.7, z: 0.7, duration: 1 });
    this.pip.setBase('idle');

    gsap.delayedCall(0.9, () => {
      this.progressBar.visible = true;
      this.progressBar.scale.setScalar(0.001);
      gsap.to(this.progressBar.scale, { x: 1, y: 1, z: 1, duration: 0.6, ease: 'back.out(2)' });
      this.ribbon.visible = true;
      this.ribbon.scale.setScalar(0.001);
      gsap.to(this.ribbon.scale, { x: 1, y: 1, z: 1, duration: 0.6, delay: 0.1, ease: 'back.out(2)' });
      this.showHand();
      audio.say('say_rub');
    });
  }

  private showHand() {
    if (this.handTween || this.phase !== 'uncover') return;
    // rub over the most covered corner (upper-left first)
    const c = this.frame.localToWorld(new THREE.Vector3(-PW * 0.3, PH * 0.18, 0));
    this.hand.visible = true;
    this.hand.position.set(c.x, c.y, 200);
    (this.hand.material as THREE.MeshBasicMaterial).opacity = 0;
    const path = { a: 0 };
    this.handTween = gsap.timeline({ repeat: -1 });
    this.handTween.to(this.hand.material, { opacity: 1, duration: 0.3 }, 0);
    this.handTween.to(path, {
      a: Math.PI * 4, duration: 2.4, ease: 'sine.inOut',
      onUpdate: () => {
        this.hand.position.x = c.x + Math.cos(path.a) * 110;
        this.hand.position.y = c.y + Math.sin(path.a * 2) * 45;
        this.hand.rotation.z = Math.sin(path.a) * 0.15;
        if (Math.random() < 0.5) this.game.particles.glitter(this.hand.position.x - 60, this.hand.position.y + 20, 0.6);
      },
    }, 0);
    this.handTween.to({}, { duration: 0.6 });
  }

  private hideHand() {
    if (!this.handTween) return;
    this.handTween.kill();
    this.handTween = null;
    gsap.to(this.hand.material, { opacity: 0, duration: 0.25, onComplete: () => { if (!this.handTween) this.hand.visible = false; } });
  }

  onPointerMove(x: number, y: number) {
    if (this.phase !== 'uncover') return;
    const local = this.frame.worldToLocal(new THREE.Vector3(x, y, 0));
    const uv = new THREE.Vector2(local.x / PW + 0.5, local.y / PH + 0.5);
    const inside = uv.x > -0.05 && uv.x < 1.05 && uv.y > -0.05 && uv.y < 1.05;
    if (!inside) { this.lastUV = null; return; }
    if (this.lastUV) {
      const d = this.lastUV.distanceTo(uv);
      this.clouds.stroke(this.lastUV.x, this.lastUV.y, uv.x, uv.y, BRUSH);
      // The rub sound only follows strokes that are actually wiping clouds away.
      if (this.cloudsUnder(uv)) this.rubLevel = Math.min(1, this.rubLevel + d * 25);
      if (d > 0.002) { this.lastRubAt = performance.now(); this.hideHand(); }
    } else {
      this.clouds.paint(uv.x, uv.y, BRUSH);
    }
    this.lastUV = uv;
  }

  /** Is there still cloud under the wand? (uses the last mask read-back, a few samples across the brush) */
  private cloudsUnder(uv: THREE.Vector2): boolean {
    const r = BRUSH * 0.45;
    const du = r / this.clouds.aspect;
    const pts = [[0, 0], [du, 0], [-du, 0], [0, r], [0, -r]];
    return pts.some(([x, y]) => {
      const u = uv.x + x, v = uv.y + y;
      return u >= 0 && u <= 1 && v >= 0 && v <= 1 && this.clouds.valueAt(u, v) < 0.55;
    });
  }

  private checkUncover(dt: number) {
    this.sampleT -= dt;
    if (this.sampleT > 0) return;
    this.sampleT = 0.15;
    const cov = this.clouds.sample();
    const p = clamp((cov - this.startCoverage) / (DONE_AT - this.startCoverage), 0, 1);
    this.setProgress(p);
    for (const pop of this.poppers) {
      if (!pop.popped && this.clouds.valueAt(pop.def.u, pop.def.v) > 0.6) this.pop(pop);
    }
    if (p > 0.65 && !this.saidAlmost) { this.saidAlmost = true; gsap.delayedCall(0.4, () => audio.say('say_almost', { interrupt: false })); }
    if (p >= 1) this.melt();
  }

  private setProgress(p: number) {
    if (p <= this.shownProgress) return;
    this.shownProgress = p;
    gsap.to(this.progressFill.uniforms.p, { value: p, duration: 0.3 });
  }

  private pop(p: Popper, quiet = false) {
    p.popped = true;
    p.mesh.visible = true;
    gsap.to(p.mesh.scale, { x: 1, y: 1, z: 1, duration: 0.9, ease: 'elastic.out(1.1,0.4)' });
    gsap.fromTo(p.mesh.position, { y: p.mesh.position.y - 30 }, { y: p.mesh.position.y, duration: 0.6, ease: 'back.out(3)' });
    const w = p.mesh.getWorldPosition(new THREE.Vector3());
    this.game.particles.starBurst(w.x, w.y, 1.1);
    this.game.particles.hearts(w.x, w.y + 40, 5);
    audio.play('boing');
    if (!quiet) audio.say('surprise_' + p.def.sprite);
    this.pip.cheer();
  }

  private poke(p: Popper) {
    gsap.fromTo(p.mesh.scale, { x: 1.25, y: 0.8 }, { x: 1, y: 1, duration: 0.7, ease: 'elastic.out(1.3,0.3)' });
    audio.play('boing', { rate: 1.2 });
    audio.say('surprise_' + p.def.sprite);
  }

  private melt() {
    if (this.phase !== 'uncover') return;
    this.phase = 'melting';
    this.hideHand();
    this.rubLevel = 0;
    audio.rub(0);
    this.setProgress(1);
    audio.play('sparkle');
    gsap.to(this.progressStar.scale, { x: 1.6, y: 1.6, z: 1.6, duration: 0.3, yoyo: true, repeat: 1 });
    gsap.to(this.progressStar.rotation, { z: Math.PI * 2, duration: 0.8 });
    gsap.to(this.clouds.mat.uniforms.melt, { value: 1, duration: 1.5, ease: 'power1.in' });
    const c = this.frame.getWorldPosition(new THREE.Vector3());
    for (let k = 0; k < 30; k++) {
      gsap.delayedCall(k * 0.04, () => this.game.particles.emit(c.x + (Math.random() - 0.5) * PW * 1.4, c.y + (Math.random() - 0.5) * PH * 1.4, { kind: PK.Twinkle, count: 3, colors: GOLD, intensity: 1.8, size: [20, 44], speed: [20, 120] }));
    }
    this.poppers.filter((p) => !p.popped).forEach((p, i) => gsap.delayedCall(0.6 + i * 0.35, () => this.pop(p, i > 0)));
    gsap.delayedCall(1.9, () => this.complete());
  }

  // ======================================================================= complete

  private complete() {
    this.phase = 'complete';
    save.complete(this.level.id, 3);
    const g = this.game;
    g.setBackground('bg/party.jpg', 0.8);
    gsap.to(this.cover.position, { y: -1400, duration: 0.9, ease: 'power2.in' });
    gsap.to([this.progressBar.scale, this.ribbon.scale], { x: 0.001, y: 0.001, duration: 0.3 });
    const target = px(960, 590);
    gsap.to(this.frame.position, { x: target.x, y: target.y, duration: 0.9, ease: 'back.out(1.2)' });
    gsap.to(this.frame.scale, { x: 0.8, y: 0.8, z: 0.8, duration: 0.9, ease: 'back.out(1.2)' });
    gsap.to(this.frame.rotation, { z: -0.035, duration: 0.9 });
    gsap.to(this.frameMat.color, { r: 1, g: 0.8, b: 0.33, duration: 0.8 });
    this.pip.dance(true);
    const pipTo = px(1405, 905, 100);
    gsap.to(this.pip.position, { x: pipTo.x, y: pipTo.y, z: pipTo.z, duration: 0.9, ease: 'back.out(1.2)' });
    gsap.to(this.pip.scale, { x: 1, y: 1, z: 1, duration: 0.9 });

    // three stars drop in one by one
    [[790, 262, 64], [960, 228, 80], [1130, 262, 64]].forEach(([x, y, s], i) => {
      const star = new THREE.Mesh(starGeometry(s), candy(PALETTE.yellow, { rough: 0.2 }));
      setPx(star, x, y, 140);
      star.rotation.z = (1 - i) * 0.15;
      this.root.add(star);
      this.completeUI.push(star);
      star.scale.setScalar(0.001);
      const tl = gsap.timeline({ delay: 0.6 + i * 0.45 });
      tl.fromTo(star.position, { y: star.position.y + 500 }, { y: star.position.y, duration: 0.55, ease: 'bounce.out' }, 0);
      tl.to(star.scale, { x: 1, y: 1, z: 1, duration: 0.4, ease: 'back.out(3)' }, 0);
      tl.call(() => { audio.play((['star1', 'star2', 'star3'] as const)[i]); g.particles.starBurst(star.position.x, star.position.y, 1.3); }, [], 0.45);
      gsap.to(star.rotation, { y: Math.PI * 2, duration: 3, delay: 2 + i * 0.2, repeat: -1, repeatDelay: 2, ease: 'power2.inOut' });
    });

    // YAY!
    gsap.delayedCall(1.9, () => {
      const yay = new CandyWord('YAY!', 128, (i) => [PALETTE.pink, PALETTE.yellow, PALETTE.mint, PALETTE.lavender][i], { outline: 0xffffff });
      setPx(yay, 960, 112, 120);
      this.root.add(yay);
      this.completeUI.push(yay);
      yay.letters.forEach((l, i) => { l.scale.setScalar(0.001); gsap.to(l.scale, { x: 1, y: 1, z: 1, duration: 0.7, delay: i * 0.08, ease: 'elastic.out(1,0.4)' }); });
      yay.userData.wave = true;
      audio.play('fanfare');
      audio.play('popper');
      audio.say('say_yay', { interrupt: false });
      g.particles.confetti(-850, -540, 70, 1.3);
      g.particles.confetti(850, -540, 70, 1.3);
      this.fireworksUntil = g.time + 5;
    });

    // buttons
    gsap.delayedCall(2.4, () => {
      const nextBtn = new RoundButton(88, PALETTE.green, 'next');
      setPx(nextBtn, 960, 968, 160);
      this.root.add(nextBtn);
      nextBtn.popIn();
      nextBtn.pulse(0.05, 1.1);
      this.clickable(nextBtn, () => this.next(), { hoverTarget: nextBtn });
      const replay = new RoundButton(56, PALETTE.pink, 'replay');
      setPx(replay, 1148, 992, 160);
      this.root.add(replay);
      replay.popIn(0.15);
      this.clickable(replay, () => g.go(new PlayScreen(g, this.level)), { hoverTarget: replay });
      this.completeUI.push(nextBtn, replay);
    });

    // the picture becomes a sticker and flies into the sticker book
    gsap.delayedCall(3.1, () => this.flySticker());
  }

  private flySticker() {
    const g = this.game;
    const book = new RoundButton(60, PALETTE.yellow, { sprite: 'book', scale: 0.95 });
    setPx(book, 1835, 95, 160);
    this.root.add(book);
    book.popIn();
    this.clickable(book, async () => { const { StickerScreen } = await import('./StickerScreen'); g.go(new StickerScreen(g, 'map')); }, { hoverTarget: book });

    const sticker = new THREE.Group();
    const border = new THREE.Mesh(roundedPlane(PW * 0.5 + 24, PH * 0.5 + 24, 30), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    const pic = new THREE.Mesh(roundedPlane(PW * 0.5, PH * 0.5, 22), new THREE.MeshBasicMaterial({ map: tex(`scenes/${this.level.id}.jpg`), toneMapped: false }));
    pic.position.z = 1;
    sticker.add(border, pic);
    sticker.position.copy(this.frame.position).setZ(300);
    sticker.scale.setScalar(1.3);
    sticker.rotation.z = -0.035;
    this.root.add(sticker);
    const end = book.position.clone().setZ(300);
    const tl = gsap.timeline();
    tl.to(sticker.scale, { x: 1.5, y: 1.5, duration: 0.3, ease: 'power2.out' });
    tl.to(sticker.position, {
      x: end.x, y: end.y, duration: 0.9, ease: 'power2.in',
      onUpdate: () => g.particles.glitter(sticker.position.x, sticker.position.y, 2),
    });
    tl.to(sticker.scale, { x: 0.05, y: 0.05, duration: 0.9, ease: 'power2.in' }, '<');
    tl.to(sticker.rotation, { z: Math.PI * 1.5, duration: 0.9, ease: 'power1.in' }, '<');
    tl.call(() => {
      this.root.remove(sticker);
      audio.play('sticker');
      g.particles.starBurst(end.x, end.y, 1.3);
      gsap.fromTo(book.scale, { x: 1.4, y: 1.4 }, { x: 1, y: 1, duration: 0.8, ease: 'elastic.out(1.2,0.3)' });
    });
  }

  private async next() {
    const g = this.game;
    const n = nextLevel(this.level);
    // Finishing a world goes back to the map, where the new world is celebrated.
    if (!n || n.world !== this.level.world) this.toMap();
    else g.go(new PlayScreen(g, n));
  }

  private async toMap() {
    const { MapScreen } = await import('./MapScreen');
    this.game.go(new MapScreen(this.game));
  }

  // ======================================================================= frame loop

  update(dt: number, t: number) {
    const g = this.game;
    this.pip.update(dt);
    this.clouds.update(t);
    if (Math.abs(this.reveal.r - this.lastR) > 0.0005) {
      this.clouds.paint(0.5, 0.5, this.reveal.r);
      this.lastR = this.reveal.r;
    }

    if (this.phase === 'typing') {
      const hint = this.hintOn();
      const target = this.word[this.typed];
      this.keys.forEach((k, ch) => {
        const on = hint && ch === target;
        k.glow.visible = on;
        if (on) {
          const s = 1 + Math.sin(t * 7) * 0.08;
          k.group.scale.set(s, s, 1);
          k.mat.color.lerp(new THREE.Color(PALETTE.yellow), 0.2);
          (k.glow.material as THREE.MeshBasicMaterial).opacity = 0.7 + Math.sin(t * 7) * 0.3;
        } else {
          k.group.scale.lerp(new THREE.Vector3(1, 1, 1), 0.2);
          k.mat.color.lerp(k.base, 0.2);
        }
      });
      if (this.hintMode === 'point' && !this.pip.isSleeping) this.pip.setBase('point');
      this.underline.children.forEach((d, k) => (d.position.y = Math.abs(Math.sin(t * 6 + k * 0.6)) * 6));

      // Idle: remind once, then Pip dozes off.
      const idle = g.idleSeconds;
      if (idle > 12 && !this.idleAsked) { this.idleAsked = true; audio.say('ask_' + this.level.id); this.asked = true; }
      if (idle > 30) this.pip.sleep();
    }
    if (this.pip.isSleeping && g.idleSeconds < 0.5) this.pip.wake();

    if (this.phase === 'uncover') this.checkUncover(dt); // may finish the picture (-> 'melting')
    if (this.phase === 'uncover') {
      // quick fade so the sound stops as soon as the wand stops wiping
      this.rubLevel *= Math.exp(-dt * 18);
      audio.rub(this.rubLevel);
      if (!this.handTween && performance.now() - this.lastRubAt > 6000 && this.lastRubAt > 0) this.showHand();
      if (g.idleSeconds > 30) this.pip.sleep();
    }
    this.progressFill.uniforms.t.value = t;

    // surprises bob gently once found
    this.poppers.forEach((p, i) => { if (p.popped) p.mesh.rotation.z = Math.sin(t * 2 + i) * 0.08; });

    if (this.phase === 'complete') {
      for (const o of this.completeUI) if (o.userData.wave) (o as CandyWord).letters.forEach((l, i) => { l.body.position.y = Math.sin(t * 4 + i * 0.7) * 12; });
      if (g.time < this.fireworksUntil && Math.random() < dt * 2.5) g.particles.fireworks((Math.random() - 0.5) * 1600, 150 + Math.random() * 300);
      if (Math.random() < dt * 3) g.particles.confetti((Math.random() - 0.5) * 1800, 560, 3, 0.2);
    }
    if (Math.random() < dt * 3) g.particles.ambient(-900, 900, -500, 500);
  }

  exit() {
    audio.rub(0);
    this.handTween?.kill();
    this.clouds.dispose();
  }
}

let glowTex: THREE.Texture | null = null;
function glowTexture() {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    glowTex = new THREE.CanvasTexture(c);
  }
  return glowTex;
}

const wait = (s: number) => new Promise<void>((r) => setTimeout(r, s * 1000));
const timeout = (p: Promise<void>, ms: number) => Promise.race([p, new Promise<void>((r) => setTimeout(r, ms))]);

