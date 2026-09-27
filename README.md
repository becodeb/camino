# Camino

A playable demo of one kids' programming platform, from *sala de 4* (age 4) to 3rd grade, with two levels ("pages") per grade. It tests whether each grade's concept can be learned in this format before the real platform is built. 1st grade also has its **whole year** (17 sheets on a forest map), being built sheet by sheet.

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
| `src/game/levels.ts` | The demo's ten levels, each one declarative `LevelDef` |
| `src/game/engine.ts` | Pure engine: commands, programs → traces, the breadth-first solver (`shortestPlan`), help search |
| `src/game/editor.ts` | Pure block-editor model (insert, move, drop, layout) |
| `src/game/hint.ts` | ✋ for programs with loops: the next gesture, from the level's reference solution |
| `src/game/lockstep.ts` | Keeps several boards stepping together (one program, three worlds) |
| `src/game/rules.ts` | 3ro: pure real-time engine of rules (key and touch triggers, falling seeds, score), stepped by ticks with seeded randomness |
| `src/game/ruleEditor.ts` | 3ro: pure model of the rule cards (one card per trigger, actions under hats, layout, drops) |
| `src/curriculum/` | 1ro's year: the sheet model, the 17 sheets, their levels, the extras generator, the progress store, the routes |
| `src/screens/` | Home (the tramo), the level screens (direct, program, the 3ro game), the forest map, a sheet's pages and doors, the dev drawer; shared pieces in `levelKit.tsx` and `yearKit.tsx` |
| `src/blocks/` | The block editor and the rule-card editor on screen |
| `src/ui/` | Drawn board (`board/BoardView.ts`), the year's drawings (`forestArt.tsx`), board thumbnails, ink filters, speech, ghost hand, dev-mode flag, CSS |
| `tools/shots.mjs` | Screenshot tour with Playwright + system Chromium (`?debug` hooks) |
| `tools/check-3ro.mjs` | Scripted browser check of the 3ro pages through the real UI (taps, a drag, the keyboard) |
| `tools/check-primer.mjs` | Scripted browser check of 1ro's year through the real UI (map, pages, seeds, dev drawer, storage) |

Routes (`src/curriculum/route.ts`):

| Hash | Screen |
|---|---|
| `#/` | Home: the tramo, five notebooks of two pages; the **1ro** tab opens the year |
| `#/nivel/<id>` | One page of the demo |
| `#/1ro` | The forest map of 1ro's year |
| `#/1ro/hoja/<n>` | A sheet: opens on its first unsolved core page, or on its doors once the core is done |
| `#/1ro/hoja/<n>/<k>` | Core page *k* |
| `#/1ro/hoja/<n>/puertas` | The three doors and the boss page |
| `#/1ro/hoja/<n>/puerta/<facil\|media\|dificil>/<i>` | The *i*-th generated extra behind a door |
| `#/1ro/hoja/<n>/jefe` | The boss |

Adding `?debug` exposes `window.__camino` for scripted screenshots
(`PW=/tmp/pw node tools/shots.mjs <outDir> [base] [t1-|t2-|t3-|p1-]`; `&nointro` skips the 3ro intro;
`PW` is any directory with `playwright` installed).

## Pages of the demo

| Grade | Page 1 | Page 2 |
|---|---|---|
| Sala 4 | Arrows move Brote right away | Same, round a rock |
| Sala 5 | Three picture cards, then ▶ | Five cards: the seed first, then the pot |
| 1ro | Eight steps, three lines: the ghost hand brings "repetir" | The staircase: repetir [→ ↑] |
| 2do | Fog: "repetir hasta llegar" + "si hay piedra, saltar" | One program, three worlds at once |
| 3ro | The first game: rule cards "cuando aprieto ←↑↓→", ▶ starts it, the keyboard plays | Seeds fall on their own: "siempre que toque una semilla, sumar 1 punto", five in the jar |

The demo's stamps live in memory only: a reload starts the tramo over.

## 1ro's year

Seventeen sheets (one per class): the forest (1–9), then the river (10–17). A sheet has 3–4 short **core** pages (one or two **essential**, marked with a red bookmark: the teacher's minimum), three **doors** of generated extras (easy, medium, hard: sprouts of growing size) and an optional **boss** with a frame of its own. The doors open when the essential pages are solved, the boss when the whole core is. Every first solve earns a **seed** that flies into the pouch (T4 plants them in a garden). Built so far: sheets 1, 2, 4, 6 and 8; the rest show a "próximamente" page.

| File | What |
|---|---|
| `curriculum/model.ts` | `Sheet`, `CoreLevel`, doors, `ExtraParams`, level ids (`coreId`, `extraId`, `bossId`) |
| `curriculum/primer.ts` | The 17 sheets: kind, zone, titles, spoken intro, extras per door, preview line |
| `curriculum/primerLevels.ts` | The handmade core pages and bosses of the built sheets |
| `curriculum/boards.ts` | Board builders: open boards, paths carved in stone, level shells |
| `curriculum/generate.ts` | The extras generator (families `sequence` and `repeat`), seeded and proved solvable |
| `curriculum/progress.ts` | The child's progress, local and versioned |
| `curriculum/route.ts` | URLs, the page a sheet opens on, "next page", what is open, Brote's sheet |

**Add a sheet.** Write its levels in `primerLevels.ts` (`coreLevel(n, k, …)`, `bossLevel(n, …)`; flat pages can use `flat(board)` to get their plan and notebook from the solver) and spread them into its entry in `primer.ts` (`...SHEET_n`), with `extras` for the three doors. `primer.test.ts` then checks the sheet's shape and every level (sane board, reference solution wins and fits, flat notebooks as long as the shortest plan, repeat levels impossible without the loop); add a test for what the sheet teaches.

**Add a generator family.** Add a variant to `ExtraParams` (`model.ts`), a `gen<Family>(params, rng)` in `generate.ts` that returns a `Generated` (board, reference solution, notebook lines, palette, a `key` that identifies the puzzle) and dispatch it in `generate()`; `generate.test.ts` runs every sheet's doors through the generic checks (solvable, harder by door, no repeats in a run or with the sheet's own levels) and each family adds its own ("needs the concept").

**Add a format** (complete, fix, predict, save: T2). The page runtime is `ProgramLevel` in `screens/LevelScreen.tsx`, driven by the `LevelDef`: a format needs a field on `LevelDef` (e.g. the program the page starts with) and its handling there; the sheet screen does not change.

**Progress API** (`curriculum/progress.ts`). Pure transitions over a `Progress` value (`solve`, `grant`, `openSheet`, `chooseCharacter`, `parse`, `sheetState`) and one store, `progress` (`get`, `update(fn)`, `reset`, `subscribe`; `useProgress()` in React). It is saved under the localStorage key `camino.progress.v1`; every storage access is wrapped, so with storage blocked it plays in memory. The next iteration can swap the backing for accounts through `createProgressStore(backing)`.

**Dev mode** (for the adult who shows or tests the demo). The small dark **dev** tab in the bottom-right corner, the <kbd>`</kbd> key (or typing *dev*), or `?dev` in the URL. While it is on nothing is blocked; the drawer jumps to any sheet, core page, door extra or boss, marks the level solved, skips to the next page, sets the sheet the teacher opened, grants seeds, resets the progress, and shows the level id and its generator seed. It lasts for the browser tab's session.
