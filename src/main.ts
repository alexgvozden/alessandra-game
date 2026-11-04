import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/700.css';
import './style.css';
import { Game } from './core/Game';
import { loadTex, loadPipMeta, SPRITES, PIP_POSES } from './core/assets';
import { loadFont } from './gfx/letters';
import { audio } from './core/audio';
import { LEVELS } from './data/levels';
import { fitStage } from './core/layout';
import { TitleScreen } from './screens/TitleScreen';
import { ParentCorner } from './parent/ParentCorner';

async function boot() {
  fitStage();
  window.addEventListener('resize', fitStage);
  const fill = document.querySelector<HTMLDivElement>('.loading-fill')!;
  const textures = [
    'bg/title.jpg', 'bg/map.jpg', 'bg/book.jpg', 'bg/party.jpg', 'bg/clouds.jpg',
    ...SPRITES.map((s) => `sprites/${s}.png`),
    ...PIP_POSES.map((p) => `sprites/pip_${p}.png`),
    ...LEVELS.map((l) => `thumbs/${l.id}.jpg`),
    ...LEVELS.map((l) => `stickers/${l.id}.jpg`),
  ];
  const phrases = ['say_hello', 'say_pick', 'say_rub', 'say_yay', 'say_great', 'say_wow', 'say_super', 'say_amazing', 'say_stickers', 'say_newworld', 'say_help', 'say_almost'];
  const total = textures.length + 20 + 3;
  let done = 0;
  const tick = () => { done++; fill.style.width = `${Math.min(100, (done / total) * 100)}%`; };

  await Promise.all([
    loadFont().then(tick),
    document.fonts.load('700 64px Fredoka').then(tick),
    loadPipMeta().then(tick),
    ...textures.map((t) => loadTex(t).then(tick)),
    audio.preloadSfx(tick),
    audio.preloadVoices(phrases),
  ]);

  const game = new Game(document.getElementById('game') as HTMLCanvasElement);
  new ParentCorner(game);
  (window as unknown as { game: Game }).game = game; // handy for debugging from the console
  // ?level=<id> jumps straight into a level (handy for testing).
  const jump = new URLSearchParams(location.search).get('level');
  if (jump && LEVELS.some((l) => l.id === jump)) {
    const { PlayScreen } = await import('./screens/PlayScreen');
    await game.go(new PlayScreen(game, LEVELS.find((l) => l.id === jump)!), { instant: true });
  } else {
    await game.go(new TitleScreen(game), { instant: true });
  }
  const loading = document.getElementById('loading')!;
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 800);
}

boot();
