import * as THREE from 'three';
import gsap from 'gsap';
import { Screen } from '../core/Screen';
import { setPx, px, PALETTE } from '../core/layout';
import { RoundButton } from '../ui/Button';
import { Pip } from '../ui/Pip';
import { audio } from '../core/audio';
import { save } from '../core/save';
import { tex } from '../core/assets';
import { LEVELS, type Level } from '../data/levels';
import { levelUnlocked, currentLevel, newlyUnlockedWorlds } from '../core/progress';
import { puffyDisc, starGeometry } from '../gfx/shapes';
import { candy, flat } from '../gfx/materials';
import { iconTexture, labelTexture } from '../gfx/canvasTex';
import { PK } from '../gfx/particles';

const COIN_R = 50;

export function thumbMaterial(map: THREE.Texture, grey = 0) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, grey: { value: grey } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform float grey; varying vec2 vUv;
      void main(){ vec4 c = texture2D(map, vUv); float l = dot(c.rgb, vec3(0.3,0.59,0.11));
        vec3 g = mix(vec3(0.55,0.53,0.64), vec3(0.93,0.92,0.97), l);
        gl_FragColor = vec4(mix(c.rgb, g, grey), 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

class Coin extends THREE.Group {
  body = new THREE.Group();
  constructor(public level: Level, state: 'done' | 'current' | 'open' | 'locked') {
    super();
    this.add(this.body);
    const color = state === 'done' ? PALETTE.gold : state === 'locked' ? PALETTE.grey : state === 'current' ? 0xfff0b8 : PALETTE.cream;
    const disc = new THREE.Mesh(puffyDisc(COIN_R, 26), candy(color));
    this.body.add(disc);
    const thumb = new THREE.Mesh(new THREE.CircleGeometry(COIN_R * 0.78, 48), thumbMaterial(tex(`thumbs/${level.id}.jpg`), state === 'locked' ? 0.85 : 0));
    thumb.position.z = 18;
    this.body.add(thumb);
    if (state === 'locked') {
      const lock = new THREE.Mesh(new THREE.PlaneGeometry(52, 52), flat(iconTexture('lock')));
      lock.position.set(COIN_R * 0.55, -COIN_R * 0.5, 30);
      this.body.add(lock);
    }
    if (state === 'done') {
      const stars = save.data.stars[level.id] ?? 3;
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(starGeometry(12), candy(i < stars ? PALETTE.yellow : PALETTE.grey));
        s.position.set((i - 1) * 28, COIN_R - 2 + (i === 1 ? 7 : 0), 34);
        s.rotation.z = (1 - i) * 0.25;
        this.body.add(s);
      }
    }
  }
}

export class MapScreen extends Screen {
  background = 'bg/map.jpg';
  private pip!: Pip;
  private coins: Coin[] = [];
  private current!: Level;
  private halo!: THREE.Mesh;
  private lastHover = '';

  enter() {
    const g = this.game;
    this.current = currentLevel();

    for (const level of LEVELS) {
      const open = levelUnlocked(level);
      const state = save.isDone(level.id) ? 'done' : !open ? 'locked' : level === this.current ? 'current' : 'open';
      const coin = new Coin(level, state);
      setPx(coin, level.coin[0], level.coin[1], 30);
      this.root.add(coin);
      this.coins.push(coin);
      coin.scale.setScalar(0.001);
      gsap.to(coin.scale, { x: 1, y: 1, z: 1, duration: 0.6, delay: 0.2 + level.index * 0.025, ease: 'back.out(2.5)', onComplete: () => { coin.userData.baseScale = coin.scale.clone(); } });
      this.clickable(coin, () => this.choose(coin), { hoverTarget: coin, sound: open });
    }

    // Glow halo + Pip on the suggested level.
    const cur = this.coins.find((c) => c.level === this.current)!;
    this.halo = new THREE.Mesh(new THREE.CircleGeometry(COIN_R * 1.7, 48), new THREE.ShaderMaterial({
      uniforms: { t: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float t; varying vec2 vUv; void main(){ vec2 d = vUv - 0.5; float r = length(d) * 2.0; float a = atan(d.y, d.x);
        vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (a / 6.2831 + t * 0.2 + vec3(0.0, 0.33, 0.67)));
        float glow = smoothstep(1.0, 0.45, r) * (0.55 + 0.25 * sin(t * 4.0)) ; gl_FragColor = vec4(mix(vec3(1.0,0.9,0.5), rainbow, 0.5) * glow * 0.75, 1.0); }`,
    }));
    this.halo.position.copy(cur.position).setZ(10);
    this.root.add(this.halo);

    this.pip = new Pip(118, g.particles);
    this.pip.position.copy(px(this.current.coin[0] + 4, this.current.coin[1] - COIN_R + 10, 60));
    this.root.add(this.pip);
    gsap.from(this.pip.scale, { x: 0.001, y: 0.001, duration: 0.7, delay: 0.9, ease: 'back.out(2)' });

    const home = new RoundButton(60, PALETTE.sky, 'home');
    setPx(home, 90, 90, 40);
    this.root.add(home);
    home.popIn(0.1);
    this.clickable(home, async () => { const { TitleScreen } = await import('./TitleScreen'); g.go(new TitleScreen(g)); }, { hoverTarget: home });

    const book = new RoundButton(60, PALETTE.yellow, { sprite: 'book', scale: 0.95 });
    setPx(book, 1640, 90, 40);
    this.root.add(book);
    book.popIn(0.2);
    this.clickable(book, async () => { const { StickerScreen } = await import('./StickerScreen'); g.go(new StickerScreen(g, 'map')); }, { hoverTarget: book });

    const star = new THREE.Mesh(starGeometry(62), candy(PALETTE.yellow));
    setPx(star, 1805, 92, 40);
    this.root.add(star);
    const count = new THREE.Mesh(new THREE.PlaneGeometry(128, 64), flat(labelTexture(String(save.totalStars()), { size: 150, w: 512, h: 256 })));
    count.position.set(0, -4, 42);
    star.add(count);
    gsap.fromTo(star.rotation, { y: -0.3 }, { y: 0.3, duration: 2, yoyo: true, repeat: -1, ease: 'sine.inOut' });

    // Celebrate newly opened worlds, otherwise invite a choice.
    const fresh = newlyUnlockedWorlds();
    if (fresh.length) {
      save.data.seenWorlds.push(...fresh.map((w) => w.id));
      save.persist();
      gsap.delayedCall(1.0, () => {
        audio.play('unlock');
        audio.say('say_newworld');
        this.pip.cheer();
        for (const w of fresh) for (const l of w.levels) {
          const p = px(l.coin[0], l.coin[1]);
          g.particles.starBurst(p.x, p.y, 1.2);
          g.particles.emit(p.x, p.y, { kind: PK.Glow, count: 1, speed: [0, 0], size: [240, 240], colors: [0xfff0a0], intensity: 1.2, life: [0.8, 0.8], shrink: 1.5 });
        }
      });
    } else {
      gsap.delayedCall(0.9, () => audio.say('say_pick'));
    }
  }

  private async choose(coin: Coin) {
    const l = coin.level;
    if (!levelUnlocked(l)) {
      audio.play('boop');
      gsap.fromTo(coin.body.rotation, { z: 0.25 }, { z: 0, duration: 0.6, ease: 'elastic.out(1.5,0.3)' });
      this.pip.think();
      return;
    }
    audio.say('word_' + l.id);
    const p = coin.position;
    this.game.particles.starBurst(p.x, p.y, 1);
    const { PlayScreen } = await import('./PlayScreen');
    this.game.go(new PlayScreen(this.game, l));
  }

  onKey(key: string) {
    if (key === 'Enter' || key === ' ') this.choose(this.coins.find((c) => c.level === this.current)!);
  }

  update(dt: number, t: number) {
    this.pip.update(dt);
    (this.halo.material as THREE.ShaderMaterial).uniforms.t.value = t;
    const cur = this.coins.find((c) => c.level === this.current);
    if (cur) cur.body.position.y = Math.abs(Math.sin(t * 3)) * 10;
    this.coins.forEach((c, i) => { if (c !== cur) c.body.rotation.y = Math.sin(t * 1.3 + i) * 0.12; });
    this.pip.position.y = (cur?.position.y ?? 0) + COIN_R - 10 + (cur?.body.position.y ?? 0);
    if (Math.random() < dt * 4) this.game.particles.ambient(-900, 900, -500, 500);

    // Say the word when the wand hovers a coin (a fun way to explore).
    const hover = this.coins.find((c) => this.game.pointerInside && Math.hypot(c.position.x - this.game.pointer.x, c.position.y - this.game.pointer.y) < COIN_R);
    const id = hover && levelUnlocked(hover.level) ? hover.level.id : '';
    if (id && id !== this.lastHover) audio.say('word_' + id);
    this.lastHover = id;
  }
}

