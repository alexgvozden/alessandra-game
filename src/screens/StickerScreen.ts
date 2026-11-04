import * as THREE from 'three';
import gsap from 'gsap';
import { Screen } from '../core/Screen';
import type { Game } from '../core/Game';
import { setPx, px, PALETTE, CANDY } from '../core/layout';
import { RoundButton } from '../ui/Button';
import { Pip } from '../ui/Pip';
import { audio } from '../core/audio';
import { save } from '../core/save';
import { tex } from '../core/assets';
import { WORLDS, type Level, type World } from '../data/levels';
import { CandyWord } from '../gfx/letters';
import { roundedPlane, starGeometry } from '../gfx/shapes';
import { candy, flat } from '../gfx/materials';
import { iconTexture } from '../gfx/canvasTex';

const SW = 304, SH = 171; // sticker picture size

/** Holographic sticker: picture with a white die-cut border and a moving rainbow sheen. */
function stickerMaterial(map: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, t: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform float t; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(map, vUv);
        float band = sin((vUv.x + vUv.y) * 7.0 - t * 1.6);
        vec3 holo = 0.5 + 0.5 * cos(6.2831 * (vUv.x * 0.8 + vUv.y * 0.5 + t * 0.1 + vec3(0.0, 0.33, 0.67)));
        c.rgb = mix(c.rgb, holo, smoothstep(0.75, 1.0, band) * 0.22);
        c.rgb += smoothstep(0.92, 1.0, band) * 0.12;
        gl_FragColor = vec4(c.rgb, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

export class StickerScreen extends Screen {
  background = 'bg/book.jpg';
  private spread = 0;
  private pageGroup = new THREE.Group();
  private pip!: Pip;
  private stickerMats: THREE.ShaderMaterial[] = [];
  private turning = false;

  constructor(game: Game, private from: 'title' | 'map') {
    super(game);
    // open on the newest sticker's world
    const last = save.data.stickers[save.data.stickers.length - 1];
    const w = WORLDS.findIndex((w) => w.levels.some((l) => l.id === last));
    this.spread = Math.max(0, w);
  }

  enter() {
    const g = this.game;
    this.root.add(this.pageGroup);
    this.buildSpread(WORLDS[this.spread]);

    const home = new RoundButton(60, PALETTE.sky, 'home');
    setPx(home, 90, 90, 60);
    this.root.add(home);
    home.popIn(0.1);
    this.clickable(home, () => this.back(), { hoverTarget: home });

    const left = new RoundButton(58, PALETTE.sky, 'left', { iconScale: 0.9 });
    setPx(left, 95, 560, 60);
    const right = new RoundButton(58, PALETTE.sky, 'right', { iconScale: 0.9 });
    setPx(right, 1825, 560, 60);
    this.root.add(left, right);
    left.popIn(0.2); right.popIn(0.25);
    this.clickable(left, () => this.turn(-1), { hoverTarget: left, sound: false });
    this.clickable(right, () => this.turn(1), { hoverTarget: right, sound: false });

    this.pip = new Pip(150, g.particles);
    this.pip.setBase('wave');
    setPx(this.pip, 1560, 250, 20);
    this.root.add(this.pip);
    gsap.from(this.pip.position, { y: this.pip.position.y - 200, duration: 0.8, delay: 0.4, ease: 'back.out(2)' });

    gsap.delayedCall(0.6, () => audio.say('say_stickers'));
  }

  private buildSpread(world: World) {
    this.stickerMats = [];
    const grp = this.pageGroup;
    grp.clear();
    this.clickables = this.clickables.filter((c) => !c.object.userData.sticker);

    // Right page header: world icon + name + stars earned
    const icon = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), flat(tex(`sprites/world_${world.id}.png`)));
    icon.position.copy(px(1250, 330, 20));
    const name = new CandyWord(world.name.toUpperCase(), 72, (i) => CANDY[i % CANDY.length], { outline: PALETTE.outline });
    name.position.copy(px(1480, 320, 30));
    grp.add(icon, name);
    const earned = world.levels.filter((l) => save.isDone(l.id)).length;
    for (let i = 0; i < world.levels.length; i++) {
      const s = new THREE.Mesh(starGeometry(18), candy(i < earned ? PALETTE.yellow : 0xe0d6c4));
      s.position.copy(px(1405 + i * 46, 395, 30));
      grp.add(s);
    }

    // Slots: 2x2 on the left page, the rest on the right page below the header
    const spots: [number, number][] = [[378, 385], [745, 385], [378, 725], [745, 725], [1190, 640], [1555, 640]];
    if (world.levels.length === 5) spots[4] = [1372, 640];
    world.levels.forEach((level, i) => this.buildSticker(level, spots[i], i));

    grp.children.forEach((c, i) => {
      const s = c.scale.clone();
      c.scale.setScalar(0.001);
      gsap.to(c.scale, { x: s.x, y: s.y, z: s.z, duration: 0.5, delay: 0.05 + i * 0.02, ease: 'back.out(2)' });
    });
  }

  private buildSticker(level: Level, [x, y]: [number, number], i: number) {
    const earned = save.isDone(level.id);
    const s = new THREE.Group();
    s.userData.sticker = true;
    if (earned) {
      const border = new THREE.Mesh(roundedPlane(SW + 26, SH + 26, 30), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
      const shadow = new THREE.Mesh(roundedPlane(SW + 26, SH + 26, 30), new THREE.MeshBasicMaterial({ color: 0x7a5a3a, transparent: true, opacity: 0.18, toneMapped: false }));
      shadow.position.set(6, -8, -1);
      const mat = stickerMaterial(tex(`stickers/${level.id}.jpg`));
      this.stickerMats.push(mat);
      const pic = new THREE.Mesh(roundedPlane(SW, SH, 20), mat);
      pic.position.z = 1;
      const word = new CandyWord(level.word, 48, (k) => CANDY[(k + i) % CANDY.length], { outline: PALETTE.outline });
      word.position.set(0, -SH / 2 - 52, 20);
      if (word.width > SW + 40) word.scale.setScalar((SW + 40) / word.width);
      s.add(shadow, border, pic, word);
      s.rotation.z = ((i * 37) % 7 - 3) * 0.012;
    } else {
      const ghost = new THREE.Mesh(roundedPlane(SW, SH, 26), new THREE.MeshBasicMaterial({ color: 0xe9dcf5, transparent: true, opacity: 0.8, toneMapped: false }));
      const q = new THREE.Mesh(new THREE.PlaneGeometry(130, 130), flat(iconTexture('question')));
      q.position.z = 2;
      s.add(ghost, q);
    }
    s.position.copy(px(x, y, 20));
    this.pageGroup.add(s);
    this.clickable(s, () => this.tapSticker(s, level, earned), { hoverTarget: s, sound: false });
  }

  private tapSticker(s: THREE.Group, level: Level, earned: boolean) {
    if (!earned) {
      audio.play('boop');
      gsap.fromTo(s.rotation, { z: 0.15 }, { z: 0, duration: 0.6, ease: 'elastic.out(1.4,0.3)' });
      this.pip.think();
      return;
    }
    gsap.fromTo(s.position, { z: 80 }, { z: 20, duration: 0.7, ease: 'bounce.out' });
    this.game.particles.starBurst(s.position.x, s.position.y, 1);
    audio.play('sparkle', { volume: 0.5 });
    audio.sequence(['word_' + level.id, 'sound_' + level.id], 100);
    this.pip.cheer();
  }

  private turn(dir: number) {
    const next = (this.spread + dir + WORLDS.length) % WORLDS.length;
    if (this.turning) return;
    this.turning = true;
    audio.play('page');
    gsap.to(this.pageGroup.scale, {
      x: 0.001, duration: 0.22, ease: 'power2.in',
      onComplete: () => {
        this.spread = next;
        this.buildSpread(WORLDS[next]);
        gsap.to(this.pageGroup.scale, { x: 1, duration: 0.3, ease: 'back.out(2)', onComplete: () => { this.turning = false; } });
      },
    });
  }

  private async back() {
    if (this.from === 'map') {
      const { MapScreen } = await import('./MapScreen');
      this.game.go(new MapScreen(this.game));
    } else {
      const { TitleScreen } = await import('./TitleScreen');
      this.game.go(new TitleScreen(this.game));
    }
  }

  onKey(key: string) {
    if (key === 'ArrowLeft') this.turn(-1);
    else if (key === 'ArrowRight') this.turn(1);
    else if (key === 'Escape' || key === 'Backspace') this.back();
  }

  update(dt: number, t: number) {
    this.pip.update(dt);
    this.stickerMats.forEach((m, i) => (m.uniforms.t.value = t + i * 0.7));
    if (Math.random() < dt * 3) this.game.particles.ambient(-900, 900, -500, 500);
  }
}
