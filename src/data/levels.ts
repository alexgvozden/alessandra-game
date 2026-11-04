import type { HintMode } from '../core/save';

export type WorldId = 'farm' | 'pond' | 'garden' | 'ocean' | 'space';

/** A hidden critter that pops out when the clouds over it are wiped away. u/v in picture space (0..1, v up). */
export interface Surprise { sprite: string; u: number; v: number; size: number }

export interface Level {
  id: string; // lower-case word, also the asset name
  word: string;
  world: WorldId;
  index: number; // global order
  surprises: Surprise[];
  coin: [number, number]; // map position (design px)
}

export interface World {
  id: WorldId;
  name: string;
  hint: Exclude<HintMode, 'auto'> | 'point';
  color: number;
  levels: Level[];
}

// Surprise spots: sky (upper corners) for fliers, ground (lower corners) for walkers/swimmers.
const UL = (s: string, size = 0.2): Surprise => ({ sprite: s, u: 0.14, v: 0.78, size });
const UR = (s: string, size = 0.2): Surprise => ({ sprite: s, u: 0.86, v: 0.8, size });
const LL = (s: string, size = 0.2): Surprise => ({ sprite: s, u: 0.15, v: 0.2, size });
const LR = (s: string, size = 0.2): Surprise => ({ sprite: s, u: 0.85, v: 0.2, size });

type Def = [word: string, coin: [number, number], surprises: Surprise[]];

const DEFS: Record<WorldId, { name: string; hint: World['hint']; color: number; defs: Def[] }> = {
  farm: {
    name: 'Farm', hint: 'point', color: 0xff8fb1, defs: [
      ['CAT', [330, 358], [LL('mouse'), UR('butterfly_s'), LR('chick')]],
      ['DOG', [445, 332], [LL('bunny'), UR('butterfly_s')]],
      ['COW', [568, 350], [LR('chick'), UL('ladybug', 0.15)]],
      ['PIG', [694, 334], [LL('mouse'), LR('frog_s')]],
      ['HEN', [470, 440], [LL('chick'), LR('bunny')]],
      ['SUN', [360, 455], [UL('butterfly_s'), LR('bunny')]],
    ],
  },
  pond: {
    name: 'Pond', hint: 'always', color: 0x7ec8f2, defs: [
      ['DUCK', [232, 902], [LR('frog_s'), UL('butterfly_s'), UR('dragonfly')]],
      ['FISH', [400, 915], [LL('goldfish'), UR('frog_s')]],
      ['FROG', [572, 905], [UL('dragonfly'), UR('butterfly_s')]],
      ['BOAT', [742, 862], [LL('goldfish'), UR('dragonfly')]],
      ['BEE', [778, 755], [LL('ladybug', 0.15), UR('butterfly_s'), LR('bunny')]],
    ],
  },
  garden: {
    name: 'Garden', hint: 'delay', color: 0x7fdbb6, defs: [
      ['TREE', [900, 445], [LL('bunny'), LR('ladybug', 0.15), UR('butterfly_s')]],
      ['APPLE', [1012, 420], [LR('ladybug', 0.15), LL('mouse')]],
      ['BIRD', [1122, 452], [UL('butterfly_s'), LR('ladybug', 0.15)]],
      ['FLOWER', [1235, 440], [LL('ladybug', 0.15), UR('butterfly_s'), LR('bunny')]],
      ['SNAIL', [1062, 522], [UL('ladybug', 0.15), LR('frog_s')]],
    ],
  },
  ocean: {
    name: 'Ocean', hint: 'wrong', color: 0x7ec8f2, defs: [
      ['WHALE', [1342, 715], [LL('jellyfish'), LR('goldfish')]],
      ['CRAB', [1462, 680], [LL('starfish'), LR('seahorse')]],
      ['SHELL', [1592, 690], [LR('starfish'), UL('jellyfish')]],
      ['TURTLE', [1445, 925], [UL('jellyfish'), LR('seahorse'), LL('goldfish')]],
      ['OCTOPUS', [1605, 928], [LL('starfish'), UR('seahorse'), LR('goldfish')]],
    ],
  },
  space: {
    name: 'Space', hint: 'ask', color: 0xb79cff, defs: [
      ['ROCKET', [1452, 292], [LL('alien'), UR('ufo'), UL('shootingstar')]],
      ['PLANET', [1562, 300], [UL('ufo'), LR('shootingstar')]],
      ['RAINBOW', [1672, 322], [UL('butterfly_s'), UR('shootingstar')]],
      ['BUTTERFLY', [1775, 322], [LL('ladybug', 0.15), UR('shootingstar')]],
      ['DINOSAUR', [1600, 398], [LL('alien'), UR('ufo')]],
    ],
  },
};

let index = 0;
export const WORLDS: World[] = (Object.keys(DEFS) as WorldId[]).map((id) => {
  const w = DEFS[id];
  return {
    id, name: w.name, hint: w.hint, color: w.color,
    levels: w.defs.map(([word, coin, surprises]) => ({ id: word.toLowerCase(), word, world: id, index: index++, surprises, coin })),
  };
});

export const LEVELS: Level[] = WORLDS.flatMap((w) => w.levels);
export const levelById = (id: string) => LEVELS.find((l) => l.id === id)!;
export const worldOf = (l: Level) => WORLDS.find((w) => w.id === l.world)!;

/** Voice lines a level needs. */
export function levelVoices(l: Level): string[] {
  const letters = [...new Set(l.word.toLowerCase())].map((c) => 'letter_' + c);
  return ['ask_' + l.id, 'word_' + l.id, 'sound_' + l.id, ...letters, ...l.surprises.map((s) => 'surprise_' + s.sprite)];
}
