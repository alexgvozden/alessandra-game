import { Howl, Howler } from 'howler';
import { save } from './save';

const BASE = './audio/';
export const SFX = ['pop', 'boop', 'thock', 'click', 'star1', 'star2', 'star3', 'chime', 'sparkle', 'magic', 'whoosh', 'rub', 'boing', 'popper', 'firework', 'fanfare', 'unlock', 'snore', 'page', 'sticker'] as const;
export type SfxId = (typeof SFX)[number];

class Audio {
  private sfx = new Map<string, Howl>();
  private voices = new Map<string, Howl>();
  private currentVoice: Howl | null = null;
  private music: Howl | null = null;
  private rubId: number | null = null;

  preloadSfx(onEach?: () => void): Promise<void> {
    return Promise.all(SFX.map((id) => new Promise<void>((res) => {
      const h = new Howl({ src: [`${BASE}sfx/${id}.wav`], preload: true, loop: id === 'rub', onload: () => { onEach?.(); res(); }, onloaderror: () => { onEach?.(); res(); } });
      this.sfx.set(id, h);
    }))).then(() => undefined);
  }

  preloadVoices(ids: string[]): Promise<void> {
    return Promise.all(ids.map((id) => this.voice(id)).map((h) => new Promise<void>((res) => {
      if (h.state() === 'loaded') return res();
      h.once('load', () => res());
      h.once('loaderror', () => res());
    }))).then(() => undefined);
  }

  private voice(id: string): Howl {
    let h = this.voices.get(id);
    if (!h) {
      h = new Howl({ src: [`${BASE}voice/${id}.wav`], preload: true });
      this.voices.set(id, h);
    }
    return h;
  }

  play(id: SfxId, opts: { rate?: number; volume?: number } = {}) {
    const h = this.sfx.get(id);
    if (!h) return;
    const sid = h.play();
    h.volume((opts.volume ?? 1) * save.data.settings.sfx, sid);
    if (opts.rate) h.rate(opts.rate, sid);
  }

  /** Speak a voice line. By default it interrupts the previous line so fast typing never piles up. */
  say(id: string, opts: { interrupt?: boolean } = {}): Promise<void> {
    const h = this.voice(id);
    if (opts.interrupt !== false && this.currentVoice && this.currentVoice !== h) this.currentVoice.stop();
    h.stop();
    this.currentVoice = h;
    h.volume(save.data.settings.voice);
    return new Promise((res) => {
      const done = () => res();
      const start = () => {
        const sid = h.play();
        h.once('end', done, sid);
        h.once('stop', done, sid);
        setTimeout(done, 6000);
      };
      if (h.state() === 'loaded') start();
      else { h.once('load', start); h.once('loaderror', done); }
    });
  }

  /** Say several lines one after another. */
  async sequence(ids: string[], gap = 150) {
    for (const id of ids) {
      await this.say(id, { interrupt: false });
      await new Promise((r) => setTimeout(r, gap));
    }
  }

  stopVoice() { this.currentVoice?.stop(); }

  /** Continuous rub sound whose loudness follows how fast the wand is moving (0..1). */
  rub(level: number) {
    const h = this.sfx.get('rub');
    if (!h) return;
    const vol = Math.min(1, level) * 0.5 * save.data.settings.sfx;
    if (vol > 0.01) {
      if (this.rubId === null) { this.rubId = h.play(); }
      h.volume(vol, this.rubId);
    } else if (this.rubId !== null) {
      h.stop(this.rubId);
      this.rubId = null;
    }
  }

  startMusic() {
    if (!this.music) this.music = new Howl({ src: [`${BASE}sfx/music.wav`], loop: true, volume: 0 });
    if (!this.music.playing()) {
      this.music.play();
      this.music.fade(0, save.data.settings.music * 0.5, 2000);
    }
  }

  applyVolumes() {
    this.music?.volume(save.data.settings.music * 0.5);
  }

  /** Duck the music under voice lines a little. */
  duck(on: boolean) {
    if (this.music) this.music.volume(save.data.settings.music * (on ? 0.25 : 0.5));
  }

  get unlocked() { return Howler.ctx?.state === 'running'; }
}

export const audio = new Audio();
