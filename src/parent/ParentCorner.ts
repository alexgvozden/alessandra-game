import type { Game } from '../core/Game';
import { save, type HintMode } from '../core/save';
import { audio } from '../core/audio';
import { WORLDS, type Level } from '../data/levels';
import { worldUnlocked } from '../core/progress';

const HINTS: [HintMode, string][] = [
  ['auto', 'Automatic (gets harder each world)'],
  ['always', 'Always glow the next key'],
  ['delay', 'Glow after 3 seconds of hesitation'],
  ['wrong', 'Glow only after a wrong key'],
  ['ask', 'Glow only when Pip is tapped'],
];

/** Parent-only settings panel. Opened by holding the P key for 3 seconds. */
export class ParentCorner {
  private el = document.getElementById('parent')!;
  private hold = document.getElementById('parent-hold')!;

  constructor(private game: Game) {
    game.onParentHold = (p) => {
      this.hold.classList.toggle('on', p > 0.15);
      (this.hold.querySelector('.ring') as HTMLElement).style.setProperty('--p', String(p));
    };
    game.onParentOpen = () => this.open();
    this.el.addEventListener('pointerdown', (e) => { if (e.target === this.el) this.close(); });
    window.addEventListener('keydown', (e) => { if (!this.el.hidden && e.key === 'Escape') this.close(); });
  }

  open() {
    this.game.inputLocked = true;
    audio.stopVoice();
    this.render();
    this.el.hidden = false;
  }

  close() {
    this.el.hidden = true;
    this.game.inputLocked = false;
    this.game.touch();
  }

  private render() {
    const s = save.data.settings;
    const stickers = save.data.stickers.length;
    this.el.innerHTML = `
      <div class="pc" role="dialog" aria-label="Parent corner">
        <header>
          <div>
            <h1>Parent corner</h1>
            <p class="note">Progress is saved in this browser only.</p>
          </div>
          <button class="close" data-act="close" aria-label="Close">✕</button>
        </header>
        <div class="stats"><span>⭐ ${save.totalStars()} stars</span><span>📖 ${stickers} of ${WORLDS.reduce((a, w) => a + w.levels.length, 0)} stickers</span></div>

        <h2>Jump to a level</h2>
        ${WORLDS.map((w) => `
          <div class="world">
            <div class="world-name">${w.name}${worldUnlocked(w) ? '' : ' <span class="lock">🔒 locked for the child (you can still jump in)</span>'}</div>
            <div class="levels">${w.levels.map((l) => `<button data-level="${l.id}"><span>${l.word}</span><span class="stars">${'★'.repeat(save.data.stars[l.id] ?? 0)}</span></button>`).join('')}</div>
          </div>`).join('')}

        <h2>Sound</h2>
        ${(['voice', 'sfx', 'music'] as const).map((k) => `
          <div class="row"><span>${{ voice: 'Voice', sfx: 'Sound effects', music: 'Music' }[k]}</span>
          <input type="range" min="0" max="1" step="0.05" value="${s[k]}" data-vol="${k}"><span data-volv="${k}">${Math.round(s[k] * 100)}%</span></div>`).join('')}

        <h2>Typing help</h2>
        <select data-set="hint">${HINTS.map(([v, t]) => `<option value="${v}" ${s.hint === v ? 'selected' : ''}>${t}</option>`).join('')}</select>

        <h2>Options</h2>
        <label class="toggle"><input type="checkbox" data-toggle="unlockAll" ${s.unlockAll ? 'checked' : ''}> Unlock all worlds on the map</label>
        <label class="toggle"><input type="checkbox" data-toggle="fullscreen" ${s.fullscreen ? 'checked' : ''}> Go full screen when PLAY is pressed</label>

        <h2>Progress</h2>
        <div class="danger-zone">
          <button class="danger" data-act="reset">Reset progress…</button>
          <div class="confirm" data-confirm>
            <span>Delete all stars and stickers?</span>
            <button class="danger" data-act="reset-yes">Yes, reset</button>
            <button data-act="reset-no">Cancel</button>
          </div>
        </div>
        <p class="note" style="margin-top:18px">Tip: hold <b>P</b> for 3 seconds to open this panel. Press <b>Esc</b> to close.</p>
      </div>`;

    this.el.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((b) =>
      b.addEventListener('click', () => this.jump(WORLDS.flatMap((w) => w.levels).find((l) => l.id === b.dataset.level)!)));
    this.el.querySelectorAll<HTMLInputElement>('[data-vol]').forEach((r) =>
      r.addEventListener('input', () => {
        const k = r.dataset.vol as 'voice' | 'sfx' | 'music';
        save.setting(k, Number(r.value));
        this.el.querySelector(`[data-volv="${k}"]`)!.textContent = `${Math.round(Number(r.value) * 100)}%`;
        audio.applyVolumes();
      }));
    this.el.querySelectorAll<HTMLInputElement>('[data-vol]').forEach((r) =>
      r.addEventListener('change', () => { if (r.dataset.vol === 'voice') audio.say('say_great'); else if (r.dataset.vol === 'sfx') audio.play('pop'); }));
    this.el.querySelector<HTMLSelectElement>('[data-set="hint"]')!.addEventListener('change', (e) => save.setting('hint', (e.target as HTMLSelectElement).value as HintMode));
    this.el.querySelectorAll<HTMLInputElement>('[data-toggle]').forEach((c) =>
      c.addEventListener('change', () => save.setting(c.dataset.toggle as 'unlockAll' | 'fullscreen', c.checked)));
    const confirm = this.el.querySelector('[data-confirm]')!;
    this.el.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => b.addEventListener('click', () => {
      switch (b.dataset.act) {
        case 'close': this.close(); break;
        case 'reset': confirm.classList.add('on'); break;
        case 'reset-no': confirm.classList.remove('on'); break;
        case 'reset-yes':
          save.resetProgress();
          this.close();
          this.goTitle();
          break;
      }
    }));
  }

  private async jump(level: Level) {
    this.close();
    const { PlayScreen } = await import('../screens/PlayScreen');
    this.game.go(new PlayScreen(this.game, level));
  }

  private async goTitle() {
    const { TitleScreen } = await import('../screens/TitleScreen');
    this.game.go(new TitleScreen(this.game));
  }
}
