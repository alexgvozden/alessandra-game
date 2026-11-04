# Alessandra's Word Magic

A typing-and-discovery game for ages 3–5, built from the plan in [`plan/GAME_DESIGN.md`](plan/GAME_DESIGN.md).
Type a word → its picture appears through magic clouds → rub the clouds away with the mouse → stars, confetti and a sticker.

## Run it

```sh
npm install
npm run dev       # http://127.0.0.1:5173
npm run build     # static site in dist/ (open with `npm run preview`)
```

## For parents

- **Parent corner:** hold **P** for 3 seconds. Jump to any level, set voice / effects / music volume,
  choose the typing help level, unlock all worlds, turn on full screen, and **reset progress**.
- Progress (stars and stickers) is saved in this browser's `localStorage`.
- There is no way to fail: a wrong key just wobbles the tile and Pip looks thoughtful.

Typing help per world (the parent corner can override it):

| World | Help |
|-------|------|
| Farm | Next key glows and Pip points at it |
| Pond | Next key glows |
| Garden | Next key glows after 3 seconds |
| Ocean | Next key glows after a wrong key |
| Space | Next key glows when Pip's **?** is tapped |

## Deploy

The game is live at https://game.getperformant.com.

`sh deploy/deploy.sh` builds the game and ships `dist/` to the server, where the `game-web` container (`deploy/docker-compose.yml`, `deploy/Caddyfile`) serves it on port 80 inside Docker. The server's front Caddy handles the hostname and TLS and proxies to `game-web:80`; this repository keeps no copy of that config.

The server address, folder and Docker network are in `deploy/deploy.env`, which is not in git: copy `deploy/deploy.env.example` and fill it in. Notes on the server itself go in `deploy/SERVER.local.md`, also kept out of git.

## Code map

| Path | What |
|------|------|
| `src/core/Game.ts` | Renderer, letterboxing, bloom/vignette/iris post-processing, input + kid-proofing, wand cursor, screen transitions |
| `src/screens/` | `TitleScreen`, `MapScreen`, `PlayScreen` (typing → word complete → uncover → celebration), `StickerScreen` |
| `src/gfx/clouds.ts` | Cloud cover shader + reveal-mask render target, wand brush, coverage sampling |
| `src/gfx/letters.ts` | 3D candy letters extruded from the Fredoka font |
| `src/gfx/particles.ts` | Instanced sparkles, confetti, glitter, hearts, bubbles, Zzz |
| `src/ui/` | Round 3D buttons and Pip the owl |
| `src/data/levels.ts` | Worlds, words, map coin positions and hidden surprises |
| `src/parent/ParentCorner.ts` | Parent settings panel |

## Assets

All art and voice were generated with Gemini; sound effects and music are synthesised.
The Gemini scripts (`gen_images.py`, `gen_voice.py`, `check_voice.py`, `plan/tools/screens.py`) read `GEMINI_API_KEY` from `.env`: copy `.env.example` and fill it in.

| Script | Output |
|--------|--------|
| `python tools/gen_images.py` | Scenes, sprites, Pip poses, backgrounds → `assets_src/raw/` |
| `python tools/process_images.py` | Chroma-key, trim and resize → `public/assets/` |
| `python tools/gen_voice.py` | Spoken letters, words, animal sounds and phrases → `public/audio/voice/` |
| `python tools/check_voice.py` | Transcribes voice clips with Gemini to verify them |
| `node tools/gen_sfx.mjs` | Sound effects and the music-box loop → `public/audio/sfx/` |

Each generator skips files that already exist; pass `--force` and a name prefix to redo one (e.g. `python tools/gen_images.py --force scene_duck`).

## Testing helpers

- `?level=duck` jumps straight into a level.
- `?awake` drives the game loop from a worker timer, so it keeps running when the browser window is hidden or occluded (used for automated checks).

## Licence

The code is under the MIT licence. The art, voice clips, music and sound effects are not: all rights reserved. See [`LICENSE`](LICENSE).
