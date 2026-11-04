/** Progress + parent settings, stored in this browser's localStorage. */

export type HintMode = 'auto' | 'always' | 'delay' | 'wrong' | 'ask';

export interface Settings {
  voice: number;
  sfx: number;
  music: number;
  hint: HintMode;
  fullscreen: boolean;
  unlockAll: boolean;
}

export interface SaveData {
  version: 1;
  stars: Record<string, number>; // level id -> stars earned
  stickers: string[]; // level ids in the order they were earned
  seenWorlds: string[]; // worlds whose unlock celebration has played
  settings: Settings;
}

const KEY = 'alessandras-word-magic/v1';

const DEFAULT_SETTINGS: Settings = { voice: 1, sfx: 0.8, music: 0.35, hint: 'auto', fullscreen: false, unlockAll: false };

function fresh(): SaveData {
  return { version: 1, stars: {}, stickers: [], seenWorlds: ['farm'], settings: { ...DEFAULT_SETTINGS } };
}

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const d = JSON.parse(raw) as Partial<SaveData>;
    return {
      ...fresh(),
      ...d,
      settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) },
    } as SaveData;
  } catch {
    return fresh();
  }
}

export const save = {
  data: load(),

  persist() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage unavailable: play on without saving */ }
  },

  complete(levelId: string, stars = 3) {
    this.data.stars[levelId] = Math.max(this.data.stars[levelId] ?? 0, stars);
    if (!this.data.stickers.includes(levelId)) this.data.stickers.push(levelId);
    this.persist();
  },

  isDone(levelId: string) { return (this.data.stars[levelId] ?? 0) > 0; },

  totalStars() { return Object.values(this.data.stars).reduce((a, b) => a + b, 0); },

  /** Wipe progress but keep the parent's settings. */
  resetProgress() {
    const settings = this.data.settings;
    this.data = fresh();
    this.data.settings = settings;
    this.persist();
  },

  setting<K extends keyof Settings>(k: K, v: Settings[K]) {
    this.data.settings[k] = v;
    this.persist();
  },
};
