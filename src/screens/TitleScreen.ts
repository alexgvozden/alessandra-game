import gsap from 'gsap';
import { Screen } from '../core/Screen';
import { setPx, CANDY, PALETTE, rand } from '../core/layout';
import { CandyWord } from '../gfx/letters';
import { RoundButton } from '../ui/Button';
import { Pip } from '../ui/Pip';
import { audio } from '../core/audio';
import { save } from '../core/save';

export class TitleScreen extends Screen {
  background = 'bg/title.jpg';
  private lines: CandyWord[] = [];
  private pip!: Pip;
  private play!: RoundButton;
  private started = false;

  enter() {
    const g = this.game;
    const l1 = new CandyWord("ALESSANDRA'S", 128, (i) => CANDY[i % CANDY.length], { outline: PALETTE.outline });
    const l2 = new CandyWord('WORD MAGIC', 150, (i) => CANDY[(i + 2) % CANDY.length], { outline: PALETTE.outline });
    setPx(l1, 960, 190, 40);
    setPx(l2, 960, 360, 40);
    this.lines = [l1, l2];
    this.root.add(l1, l2);
    this.lines.forEach((line, li) => line.letters.forEach((l, i) => {
      l.scale.setScalar(0.001);
      gsap.to(l.scale, { x: 1, y: 1, z: 1, duration: 0.8, delay: 0.15 + li * 0.35 + i * 0.05, ease: 'elastic.out(1,0.45)' });
    }));

    this.play = new RoundButton(135, PALETTE.yellow, 'play', { iconScale: 1.1 });
    setPx(this.play, 960, 865, 60);
    this.root.add(this.play);
    this.play.popIn(0.9);
    this.play.pulse(0.05, 1.2);
    this.clickable(this.play, () => this.start(), { hoverTarget: this.play });

    const book = new RoundButton(72, PALETTE.yellow, { sprite: 'book', scale: 0.95 });
    setPx(book, 1810, 105, 40);
    this.root.add(book);
    book.popIn(1.2);
    this.clickable(book, () => this.openBook());

    this.pip = new Pip(330, g.particles);
    this.pip.setBase('wave');
    setPx(this.pip, 1560, 1010, 80);
    this.root.add(this.pip);
    gsap.from(this.pip.position, { x: this.pip.position.x + 600, duration: 1, delay: 0.5, ease: 'back.out(1.4)' });
  }

  private async start() {
    if (this.started) return;
    this.started = true;
    this.pip.cheer();
    this.game.particles.starBurst(0, -325, 1.5);
    audio.play('magic');
    if (save.data.settings.fullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    await Promise.race([audio.say('say_hello'), new Promise((r) => setTimeout(r, 2200))]);
    const { MapScreen } = await import('./MapScreen');
    this.game.go(new MapScreen(this.game));
  }

  private async openBook() {
    const { StickerScreen } = await import('./StickerScreen');
    this.game.go(new StickerScreen(this.game, 'title'));
  }

  onKey(key: string) {
    if (key === 'Enter' || key === ' ') this.start();
  }

  update(dt: number, t: number) {
    this.pip.update(dt);
    this.lines.forEach((line, li) => line.letters.forEach((l, i) => {
      l.body.position.y = Math.sin(t * 2.2 + i * 0.5 + li) * 7;
      l.body.rotation.z = Math.sin(t * 1.7 + i * 0.8) * 0.04;
    }));
    if (Math.random() < dt * 6) this.game.particles.ambient(-900, 900, -500, 500);
    if (Math.random() < dt * 0.6) {
      const x = rand(-300, 300);
      this.game.particles.glitter(x, rand(-150, -60), 1);
    }
  }
}
