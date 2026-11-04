import { WORLDS, LEVELS, type Level, type World } from '../data/levels';
import { save } from './save';

export function worldUnlocked(w: World): boolean {
  const i = WORLDS.indexOf(w);
  if (i <= 0 || save.data.settings.unlockAll) return true;
  return WORLDS[i - 1].levels.every((l) => save.isDone(l.id));
}

export const levelUnlocked = (l: Level) => worldUnlocked(WORLDS.find((w) => w.id === l.world)!);

/** The level Pip suggests: the first unfinished one that is open. */
export function currentLevel(): Level {
  return LEVELS.find((l) => levelUnlocked(l) && !save.isDone(l.id)) ?? LEVELS[LEVELS.length - 1];
}

/** Level after `l` if it can be played, else null. */
export function nextLevel(l: Level): Level | null {
  const n = LEVELS[l.index + 1];
  return n && levelUnlocked(n) ? n : null;
}

/** Worlds that just became playable and haven't been celebrated yet. */
export function newlyUnlockedWorlds(): World[] {
  return WORLDS.filter((w) => worldUnlocked(w) && !save.data.seenWorlds.includes(w.id));
}
