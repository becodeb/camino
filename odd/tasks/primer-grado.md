# Feature: primer-grado

Locator: `odd/tasks/primer-grado.md` (Engram mirror: project `camino`, topic `odd/primer-grado/tasks` — pending, see Constraints)

## Objective

A presentable demo of the whole 1st-grade year of Camino (17 sheets, "Repetir", forest and river zones) that the teacher can show at the school, plus a dev mode to jump anywhere and test it.

## Problem

The current demo has 2 levels per grade. To show the school how a real year works, 1st grade needs its full plan: every sheet with its core, generated extras and boss, the new practice formats, the workshops, the recess and showcase sheets, and the motivation layer (garden, critters, wardrobe).

## Source plan

The approved activities plan (Claude Docs "Plan de actividades de Camino", section "1er grado · Repetir" and "Cómo funciona cada clase" / "Juego y motivación"). The 17 sheets:

| # | Sheet | What kids do |
|---|---|---|
| 1 | Llegada al bosque | Review sala 5 plans; choose character |
| 2 | Caminos largos | 8–12 step plans collecting things in order |
| 3 | Brote se confundió | Fix and predict, still without repeat |
| 4 | Otra vez | Not enough lines → repeat with one block |
| 5 | ¿Cuántas veces? | Complete the count; count passes with the dots |
| 6 | La escalera | Repeat a two-block pattern |
| 7 | Taller: mi primer nivel | Create a level classmates play |
| 8 | Zigzag | Three-block patterns |
| 9 | Recreo: música | Build a song; the chorus is a repeat |
| 10 | Vuelta: el río | Review repeat in the new zone |
| 11 | Ahorrá | Find the pattern in their own solution; gold stamp |
| 12 | El repetir roto | Fix a wrong count or an extra block inside |
| 13 | Antes y después | Steps, a repeat, then steps again |
| 14 | Guardas | Repeat to draw notebook borders |
| 15 | Taller: un nivel con límite | A block-limited level for a classmate |
| 16 | Comodín | Recess or catch-up |
| 17 | Muestra | Teach their family a level; tour their garden |

## Scope (authorized 2026-09-27)

- Work in `~/projects/camino` on branch `feat/primer-grado` (branched from `feat/demo-recorrido` at 174fda4). Keep the existing 10-level demo reachable.
- Per sheet: core (3–4 short levels, 1–2 marked essential), generated extras of the same topic behind three doors (easy / medium / hard), a handmade optional boss. Five practice formats: solve, complete, fix, predict, save blocks (gold stamp).
- Progress stored locally in the browser for one player (accounts come next iteration). Wrap storage in try/catch; the app must work without it.
- Dev mode (always available in this demo): jump to any sheet/level/extra/boss, mark solved, skip, reset progress, set the "sheet opened by the teacher", grant seeds and items, open the wardrobe anytime. Clearly marked as dev.
- Motivation layer for 1ro: garden (each solved level plants a seed, stamps grow rare flowers, bosses send critters: carpincho, lechuza, pájaro carpintero, rana, coatí, zorro), wardrobe (Brote, Mina, Pliegue, Ovillo + zone items: gorro de hongo, capa de hoja, botas de lluvia, mochila de explorador), end-of-sheet preview card.
- Out of scope (next iteration): accounts, teacher dashboard, automatic reports, help detection, adaptations (slower pace, starting sheets back, new students), class tree.

## Design rules

The approved rules of `odd/tasks/demo-recorrido.md` still apply (drawn habilidades universe, full width, three controls, no reading required, blocks with picture + one word in 1ro, absolute arrows, palette = level blocks, diegetic failure, ghost hand for new concepts, ≥ 48 px targets).

## Art rule

All new art is designed by Opus with the style references: `docs/style-guide.md` (habilidades docs/05), `docs/screen-layout.md` (habilidades docs/17), `docs/style-refs/*.png` (habilidades screen + current camino screens), and the existing drawing code (`src/ink/*`, `BoardView`). Art is drawn in code (SVG), like the rest of the app.

## Constraints

- Raspberry Pi: one writer at a time; vitest `--maxWorkers=2`.
- The parent keeps a dev server on port 8797 for the user: writers use port 8798 for their own checks and never kill the 8797 process.
- Code, comments, docs, commits in English; kid-facing copy and speech in Rioplatense Spanish.
- Engram mirror pending: the engram MCP resolves `~/projects` as an ambiguous project and does not offer `camino`.
- Advisory: ~400 authored changed lines per task is a planning heuristic, not a cap.

## Checks

- TDD: off (no project/session configuration). Runner: vitest.
- Per task: `npm run typecheck`, `npm test`, `npm run build`, screenshots reviewed by the writer and re-checked by the parent.
- RDD: off globally by the user.

## Tasks

- [x] T1 — Curriculum model (sheet/core/extras/boss), local progress store, dev mode, 1ro forest map with 17 sheets, sheet screen with three doors, extras generator (solve + repeat families), sheets 1, 2, 4, 6, 8 fully built (existing 1ro-1/1ro-2 folded in). Route: delegated direct.
- [ ] T2 — Formats complete / fix / predict / save (gold stamp), extras for those families; sheets 3, 5, 10, 11, 12, 13; river zone. Route: delegated direct.
- [ ] T3 — New mechanics: guardas painting (14), music (9), level editor + classmates' gallery (7, 15), comodín (16). Route: delegated direct.
- [ ] T4 — Motivation: garden, critters, wardrobe, end-of-sheet preview, showcase sheet (17). Route: delegated direct.
- [ ] T5 — Parent pass: full screenshot tour, presentation script for the school, LAN instructions.

## Progress

- 2026-09-27: branch `feat/primer-grado` created; style references copied into `docs/`.
- 2026-09-27: T1 done. Route: delegated direct (writer trigger: 2+ non-trivial files). The first writer was interrupted by a container restart after committing `524322a` (sheet model, the 17 sheets, progress store) and leaving the extras generator untracked but green; a second writer resumed from that state: reviewed the generator against the brief, committed it, then built the rest, one work-unit commit at a time.
  - Commits: `524322a` (model, 17 sheets, progress store), `f257583` (extras generator; the breadth-first solver moves into the engine), `47d4d64` (forest map, routes, dev-mode flag), `2ff4313` (sheet pages, doors page, boss frame, dev drawer, `LevelNav` context), `eae4a19` (sheets 1, 2, 4, 6, 8), `70abb48` (shut doors greyed), `5dbe594` (p1 tour and scripted check), plus the docs commit that records this entry.
  - Checks: `npm run typecheck` clean; `npm test` 11 files, 282 passed; `npm run build` ok (JS 435 kB, 136 kB gzip). `tools/shots.mjs … p1-` (24 shots at 1366×768 and 1280×800: map fresh and mid-year, home, each built sheet's first page, a 12-line boss, a won page, the sheet 6 ghost intro, doors open and shut, a boss, one extra per door plus a 12-step one, dev drawer on a level and on the map, a sheet not built yet): no console errors, no page scroll, every shot reviewed. `tools/check-primer.mjs` (real clicks, one drag, the ` key): 11 ok lines — the home's 1ro tab opens the map (Brote on 1, sheet 2 waits, 0 seeds); pages 1 and 2 of sheet 1 solved by hand, the seed count rises 0 → 1 → 2 and the pages are stamped; the drawer marks page 3 (3 seeds) and skips to the open doors; the easy door opens an extra with its seed shown; sheet 1 is stamped on the map; dev jumps to sheet 6, its boss (framed), its hard door and sheet 12 (próximamente); a reload keeps seeds and stamp; cleared storage starts over; blocked localStorage and sessionStorage still play and count in memory; no console errors. Demo regressions: `tools/check-3ro.mjs` all ok; T1 and T2 tours: no console errors.
  - Decisions (to review): the doors open once the essential pages are solved (a child stuck later in the core can practise behind the easy door), the boss once the whole core is; shut doors carry a wooden bar and are greyed. Essential pages are marked with a red ribbon bookmark, not a star. The map is a two-row serpentine on a taped page: the forest row left to right, a climb on the right, the river row right to left along the bank; stops are notebook pages (forest) or flat stones (river); the kind of class is drawn on its stop (pencil: taller, note: recreo, kite: comodín, bunting: muestra); Brote waits on the first open built sheet not complete, with the walked path dotted in blue pen. The sheet's pages, doors and boss in the bar are links. The doors page puts three arched doors in the forest (sprouts: tiny, four leaves, a small tree in flower) next to the boss page, which shows a drawing of its board; its "next page" goes back to the map. The boss's level page gets a wider margin with a vine of leaves and berries and red tape. A won seed flies from the goal into a pouch in the bar and is counted when it lands (the pouch is also on the map and the doors page); screen-layout rule 8 forbids scores during the activity, so it stays a quiet count. Notebooks over ten lines use 76 × 46 blocks so twelve lines fit a 768 px screen. The flat-program help now completes plans with the solver (it was an exponential search, slow at twelve lines). Extras never repeat the sheet's own levels, and sheet 4's one-arrow doors got wider counts so a run has enough different paths. Sheet 2's plans are 8, 9, 10, 11 steps and a 12-step boss, and every seed costs a detour. The bosses of sheets 4, 6 and 8 need two repeats (an "L", a mountain, a hill): a stretch goal, since sheet 13 formally teaches steps around a repeat. The sheet's spoken intro is said once per visit, before its first page's line. Dev mode: a small dark "dev" tab (off → open → folded), the ` key or typing d-e-v, `?dev`; it lasts for the tab's session. Sheet 1's character choice is a placeholder (Brote) until T4.
  - Known issues: 46 px tall blocks in 11–12-line notebooks are just under the 48 px target rule. Closed doors and bosses are blocked in the UI only; their URLs open (for the teacher). The bar of sheet 2 is busy (a drawn instruction with three seeds, four pages, three doors, the boss, the pouch) and squeezes the adult title at 1280. The map shows 12 of 17 stops dashed until T2–T4 build them. Untested: speech audio, a real touch Chromebook, a viewport shortened by the browser chrome, real kids. The demo's open items (BlockEditor drag grip, confetti below short sheets, 3ro-2 thumbnail keys) are unchanged.
  - For T2–T4: add a sheet's levels in `curriculum/primerLevels.ts` (`coreLevel`, `bossLevel`, `flat(board)`, `carvedBoard`, `openBoard` from `boards.ts`) and spread them into its entry in `primer.ts`; `primer.test.ts` checks every level generically. A new format is a `LevelDef` field handled in `ProgramLevel` (`screens/LevelScreen.tsx`); the sheet screen gives every level page its bar, win, next page and seed through `LevelNav` (`screens/levelKit.tsx`) and needs no change. A generator family is an `ExtraParams` variant plus a `gen*` function returning a `Generated` with a `key`; `generate.test.ts` runs every door through the generic checks. Progress API (`curriculum/progress.ts`): pure `solve`, `grant`, `openSheet`, `chooseCharacter`, `parse`, `sheetState`, and the `progress` store (`get`, `update`, `reset`, `subscribe`, `useProgress`), key `camino.progress.v1`, swappable backing via `createProgressStore`. Scripts preload progress into that key (`shots.mjs` scenarios take `progress`); `?debug` keeps `window.__camino`; the dev drawer carries `data-dev*` attributes for automation. T4: `sheet.preview` holds each end-of-sheet line (the card is not drawn yet); the pouch and the flying seed live in `screens/yearKit.tsx`.
  - Engram mirror pending (the engram MCP resolves `~/projects` as an ambiguous project and does not offer `camino`).

## Next step

Launch T2 (formats complete / fix / predict / save, their extras families, sheets 3, 5, 10–13, the river zone).
