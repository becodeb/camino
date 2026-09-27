# Camino

A playable demo of one kids' programming platform, from *sala de 4* (age 4) to 3rd grade, with two levels ("pages") per grade. It tests whether each grade's concept can be learned in this format before the real platform is built.

The visual language, the character (Brote), the hand-drawn helpers, the block editor, the board animation, speech and the ghost hand are copied from `~/projects/habilidades` (commit `9b90d1d`) and adapted.

## Run

```bash
npm install
npm run dev        # http://localhost:8797 (also on the LAN: --host 0.0.0.0)
npm test           # vitest, --maxWorkers=2 (Raspberry Pi)
npm run typecheck
npm run build      # static files in dist/
```

Port **8797** (8795/8796 belong to habilidades).

## How it is organized

| Path | What |
|---|---|
| `src/game/levels.ts` | Every level as one declarative `LevelDef` (the only place to add a level) |
| `src/game/engine.ts` | Pure engine: commands, programs → traces, help search |
| `src/game/editor.ts` | Pure block-editor model (insert, move, drop, layout) |
| `src/game/hint.ts` | ✋ for programs with loops: the next gesture, from the level's reference solution |
| `src/game/lockstep.ts` | Keeps several boards stepping together (one program, three worlds) |
| `src/screens/` | Home (the whole tramo) and the level screen (direct and program modes) |
| `src/blocks/` | The block editor on screen |
| `src/ui/` | Drawn board (`board/BoardView.ts`), ink filters, speech, ghost hand, CSS |
| `tools/shots.mjs` | Screenshot tour with Playwright + system Chromium (`?debug` hooks) |

Routes: `#/` home, `#/nivel/<level id>`. Adding `?debug` exposes `window.__camino` for scripted screenshots
(`PW=/tmp/pw node tools/shots.mjs <outDir> [base] [t1-|t2-]`).

## Pages so far

| Grade | Page 1 | Page 2 |
|---|---|---|
| Sala 4 | Arrows move Brote right away | Same, round a rock |
| Sala 5 | Three picture cards, then ▶ | Five cards: the seed first, then the pot |
| 1ro | Eight steps, three lines: the ghost hand brings "repetir" | The staircase: repetir [→ ↑] |
| 2do | Fog: "repetir hasta llegar" + "si hay piedra, saltar" | One program, three worlds at once |

Progress (the stamps) lives in memory only: a reload starts over.
