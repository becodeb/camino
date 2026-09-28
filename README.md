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
| `src/game/engine.ts` | Pure engine: commands, programs → traces, the breadth-first solver (`shortestPlan`), help search, `unroll` (the cards a program plays) |
| `src/game/judge.ts` | What a program does on any kind of page (a walk, a song, a guarda) as the engine's `Trace`: `tracesOf`, `wins`, `judgeOf` |
| `src/game/music.ts` | 1ro's music recess: note cards, the xylophone as a board, a song played as a trace |
| `src/game/guarda.ts` | 1ro's guardas: borders drawn on squared paper, the guide, a drawing as a trace |
| `src/game/editor.ts` | Pure block-editor model (insert, move, drop, layout) |
| `src/game/hint.ts` | ✋ for programs with loops: the next gesture, from the level's reference solution |
| `src/game/lockstep.ts` | Keeps several boards stepping together (one program, three worlds) |
| `src/game/rules.ts` | 3ro: pure real-time engine of rules (key and touch triggers, falling seeds, score), stepped by ticks with seeded randomness |
| `src/game/ruleEditor.ts` | 3ro: pure model of the rule cards (one card per trigger, actions under hats, layout, drops) |
| `src/curriculum/` | 1ro's year: the sheet model, the 17 sheets, their levels, the extras generator, the progress store, the routes |
| `src/screens/` | Home (the tramo), the level screens (direct, program, the 3ro game), the forest map, a sheet's pages and doors, the workshops' editor (`WorkshopScreen.tsx`), the corkboard (`CorkboardScreen.tsx`), the comodín (`HubScreen.tsx`), the dev drawer; shared pieces in `levelKit.tsx` and `yearKit.tsx` |
| `src/blocks/` | The block editor and the rule-card editor on screen |
| `src/ui/` | Drawn board (`board/BoardView.ts`, and its subclasses `MusicView.ts`, `GuardaView.ts` and the editor's `EditorView.ts`), the year's drawings (`forestArt.tsx`, `noteArt.ts`, `workshopArt.tsx`, `hubArt.tsx`), board thumbnails, ink filters, speech, the xylophone's synth (`sound.ts`), ghost hand, dev-mode flag, CSS |
| `tools/shots.mjs` | Screenshot tour with Playwright + system Chromium (`?debug` hooks) |
| `tools/check-3ro.mjs` | Scripted browser check of the 3ro pages through the real UI (taps, a drag, the keyboard) |
| `tools/check-primer.mjs` | Scripted browser check of 1ro's year through the real UI (map, pages, seeds, formats, music, guardas, the workshops and the corkboard, the comodín, dev drawer, storage) |

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
| `…/oro` after a level page | That page's gold-stamp challenge (save blocks), e.g. `#/1ro/hoja/11/2/oro` |
| `#/1ro/hoja/<7\|15>/taller` | A workshop's level editor; `…/taller/probar` its test page (the author plays the level) |
| `#/1ro/hoja/<7\|15\|16>/cartelera` | The class corkboard; `…/cartelera/<card>` a card played (`ej-3`, `yo-1`) |
| `#/1ro/hoja/16/comodin` | The comodín's three choices; `…/recuperar` the bridge of pending pages, `…/recuperar/<m>/<k>` one of them, `…/repaso/<m>/<i>` a review page, `…/musica` the free song |

Adding `?debug` exposes `window.__camino` for scripted screenshots
(`PW=/tmp/pw node tools/shots.mjs <outDir> [base] [t1-|t2-|t3-|p1-|p2-|p3a-|p3b-]`; `&nointro` skips the 3ro intro;
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

Seventeen sheets (one per class): the forest (1–9), then the river (10–17). A sheet has 3–4 short **core** pages (one or two **essential**, marked with a red bookmark: the teacher's minimum), three **doors** of generated extras (easy, medium, hard: sprouts of growing size) and an optional **boss** with a frame of its own. The doors open when the essential pages are solved, the boss when the whole core is. Every first solve earns a **seed** that flies into the pouch (T4 plants them in a garden). Built so far: sheets 1–16 (7 and 15 are workshops, 16 the comodín, below); 17 shows a "próximamente" page. The river's boards have their own look: a sandy bank with reeds, water Brote cannot step in, stepping stones across it.

**The workshops** (sheets 7 and 15, `Sheet.workshop`, `curriculum/workshop.ts`): the child makes a level for a classmate. The **editor** copies the level page: the tools where the palette goes (Brote, the seed, the pot, a rock, the eraser), a 6 × 4 board where the board goes, ▶ and ↺ over it. A tool is picked with a tap and used with a tap on a cell, or dragged onto one; a piece on the board is dragged to another cell; Brote, the seed and the pot are always there (one each; the eraser only takes rocks). ▶ asks the **solver** first: a level Brote cannot finish, or longer than a notebook, is refused without words (Brote looks puzzled, what he cannot reach wiggles); a good one opens its **test page**, the normal level page with the notebook the classmates will get (as many lines as the shortest plan). Winning it offers a push-pin that pins the level on the **class corkboard**. Sheet 15 adds the notebook's lines as a setting (between the tools and the board: the start block, one dashed line per card, the eraser and the pencil) and the level must **need a repeat**: when a plan without one fits the lines, ▶ is refused with the notebook shaking, the eraser calling and Brote thinking of the repeat block; when even a repeat does not fit, the pencil calls. A workshop is done when one of its levels is pinned and a classmate's level is played (a limited one on sheet 15). The first visit to sheet 7 starts with the ghost hand placing the seed and pointing at ▶.

**The corkboard** (`#/1ro/hoja/<7|15|16>/cartelera`): cork in a wooden frame, a paper card per level (its board drawn small, a push-pin, the author's badge: a classmate's character on their colour, or a star sticker on a level made here; the repeat's tape and its lines on a limited level; the times it was played to a win **on this device** in pencil tally marks; the red stamp once solved). There are no accounts in this demo: the eight classmates' levels are examples (`curriculum/classmates.ts`, proven by the tests; the adult's small print says so), next to every level made on this device. A card plays as a normal page (a seed on its first solve, a play more on every win) and "next page" goes back to the corkboard.

**The comodín** (sheet 16, `Sheet.hub`): three big drawn choices on the riverbank: a footbridge (**recuperar**: the essential pages still pending on the sheets the teacher opened stand on a long bridge across the river; with nothing pending, one review page from an easy door, taken at random), the xylophone (sheet 9's free song) and the corkboard on its easel. Each is played as a normal page with the comodín's bar; a pending page counts for its own sheet; the first choice played from here does the sheet. In dev mode the bridge takes every sheet's pending pages.

**Two sheets are not walks** (`LevelDef.music`, `LevelDef.guarda`; the formats above work on them too):

| Sheet | The page | Won when | Fails diegetically by |
|---|---|---|---|
| 9 · Recreo: música | Note cards (a coloured xylophone bar each, do to sol, or the rest sign); Brote hops the bars of a big xylophone on the grass and each one rings (Web Audio, `ui/sound.ts`, quiet); the song to copy is taped above as a strip of bars, a tap plays it | The notebook plays the song beat by beat; a free page (`music.free`) wins with a few notes and stays playable | The first wrong beat stops the song: its card shakes, the beat that was due is circled on the strip and its bar blinks; a song cut short circles its next beat |
| 14 · Guardas | Arrows on a page of the squared notebook lying on the riverbank; the guarda is a faint pencil line; Brote walks the paper's lines and inks each segment in blue pen | Every segment of the pencil is inked (going back over ink is fine) | A step off the pencil smudges the ink and its card shakes; a guarda cut short leaves the pencil still to ink calling |

Everything still shows without sound: a bar that rings also dips, lights up and floats a note.

**Practice formats** (`LevelDef.format`, `game/formats.ts`), all wordless, with the same three controls:

| Format | The page | Fails diegetically by |
|---|---|---|
| `solve` (default) | An empty notebook of N lines | Brote bumps, the culprit shakes, the empty line calls |
| `complete` | `given` arrives partly built; what is written is taped on (it only wiggles); empty dashed lines and a dashed count disc are the child's | ▶ does not run while something is missing; the count or the line calls |
| `fix` | `given` arrives complete with one mistake; every line stays in place: a tap on a block takes it out and leaves its line empty (it takes the next tap), a tap on the palette fills it; a drag lands on an empty line | The run bumps right on the wrong block and it shakes; a count too short stops short and calls |
| `predict` | `given` read-only; a tap on a board cell draws a pen ring, ▶ plays | Brote ends elsewhere: he turns to the ring, "¿Mmm?"; a new tap moves the ring |
| save blocks (`LevelDef.save`) | Once the page is solved, a gold seal appears next to the next-page button; its challenge (`…/oro`) is the same board with the fewest lines, "repetir" in the palette and the child's own long plan taped in the notebook | As any plain page; winning stamps the page in gold (no extra seed) |

| File | What |
|---|---|
| `curriculum/model.ts` | `Sheet`, `CoreLevel`, doors, `ExtraParams` (one family per door, or several in turns), level ids (`coreId`, `extraId`, `bossId`) |
| `curriculum/primer.ts` | The 17 sheets: kind, zone, titles, spoken intro, extras per door, preview line |
| `curriculum/primerLevels.ts` | The handmade core pages and bosses of the built sheets; format helpers (`fix`, `fixPlan`, `complete`, `predict`, `withGold`) |
| `curriculum/boards.ts` | Board builders: open boards (rocks, puddles, water, stepping stones, no goal for predict), paths carved in stone or across the river (`look: 'river'`), level shells |
| `curriculum/generate.ts` | The extras generator (families `sequence`, `repeat` with steps around it or a gold challenge, `predict`, `fix`, `complete`, `melody`, `guarda`), seeded and proved by the engine |
| `curriculum/progress.ts` | The child's progress, local and versioned: solved pages, gold stamps, seeds, levels made in the workshops, their plays, drafts, the comodín's goals |
| `curriculum/route.ts` | URLs, the page a sheet opens on, "next page", what is open, Brote's sheet, the comodín's bridge (`pendingEssentials`, `reviewPage`) |
| `curriculum/workshop.ts` | Made levels as data (`MadeBoard`, `Draft`, `MadeLevel`), the editor's edits (`applyTool`, `movePiece`), the solver's verdict (`verdictOf`: solvable, fits, needs a repeat; `fewestProgram`), the pages a made level becomes (`draftLevel`, `cardLevel`), the corkboard's cards |
| `curriculum/classmates.ts` | The fictional classmates and their eight example levels |
| `game/formats.ts` | What a page starts with and pins, where Brote ends, how a fix differs from its reference, the gold challenge |

**Add a sheet.** Write its levels in `primerLevels.ts` (`coreLevel(n, k, …)`, `bossLevel(n, …)`; flat pages can use `flat(board)` to get their plan and notebook from the solver; formats use `fix(board, given, fixed)`, `complete(board, given, solution)`, `predict(board, program)`, `withGold(flat(board), better)`) and spread them into its entry in `primer.ts` (`...SHEET_n`), with `extras` for the three doors. `primer.test.ts` then checks the sheet's shape and every level by its format (sane board; the reference wins and fits; flat notebooks as long as the shortest plan; repeat levels impossible without the loop; a fix differs in exactly one line or count and Brote shows it; a complete page has one answer per missing piece; a predict program never bumps nor crosses itself; a gold challenge is optimal); add a test for what the sheet teaches.

**Add a generator family.** Add a variant to `ExtraParams` (`model.ts`), a `gen<Family>(params, rng)` in `generate.ts` that returns a `Generated` (board, reference program, notebook lines, palette, a `key` that identifies the puzzle, and `format`/`given`/`save` when the page is not a plain one) and dispatch it in `genOf()`; `generate.test.ts` runs every sheet's doors (and four test-only lab sheets that exercise every family, forest and river) through the generic checks (sane, proved, harder by door, no repeats in a run or with the sheet's own levels) and each family adds its own. The same seeds give the same extras (the river only changes the look).

**Add a format.** A field on `LevelDef` and its handling in `screens/LevelScreen.tsx` (`ProgramLevel` for notebook formats, `PredictLevel` for predict); the fixed-lines editing lives in `game/editor.ts` (`holesOf`, `writeLine`, `holeAt`, `resolveLinesDrop`) and `BlockEditor` (`lines: 'fixed' | 'read'`, `pinned`). The sheet screen passes a sheet's extras through `LevelNav` (`won(level, program)` may return the line to say, `gold(level, won)` draws the seal, `notebook` the note in the notebook).

**Add a kind of page** (like the music and the guardas, whose goal is not a walk): a field on `LevelDef`, a pure `…Trace(board, def, program)` that returns the engine's `Trace` (a step per card, `crash` on the culprit, `won` on the last step) and its branch in `game/judge.ts`; a `BoardView` subclass that draws the world in `setBoard` and animates the trace in `play` (same contract: `onStep`, the outcome), picked in `useBoards` (`LevelScreen.tsx`) with its frame in `frameFor` (`levelKit.tsx`). The notebook, the three controls, the formats, the help (`hint.ts` takes the page's judge), the seeds and the gold seal come for free. Give it a drawn instruction (`LevelBar.tsx`), a thumbnail (`PageThumb`) and a generator family keyed like its levels (`keyOfLevel`).

**Progress API** (`curriculum/progress.ts`). Pure transitions over a `Progress` value (`solve`, `earnGold`, `grant`, `openSheet`, `chooseCharacter`, `saveDraft`, `publish`, `played`, `clearMade`, `reachGoal`, `parse`, `sheetState`) and one store, `progress` (`get`, `update(fn)`, `reset`, `subscribe`; `useProgress()` in React). It is saved under the localStorage key `camino.progress.v1` (`gold` was added in T2, `made`, `plays`, `drafts` and `goals` in T3b; older stored values read as none, and a broken made level or draft is left out on read); every storage access is wrapped, so with storage blocked it plays in memory. The next iteration can swap the backing for accounts through `createProgressStore(backing)` (the corkboard's cards would then come from the class).

**Dev mode** (for the adult who shows or tests the demo). The small dark **dev** tab in the bottom-right corner, the <kbd>`</kbd> key (or typing *dev*), or `?dev` in the URL. While it is on nothing is blocked; the drawer jumps to any sheet, core page, door extra or boss (and to a page's gold challenge), marks the level solved (or its gold stamp earned), skips to the next page, sets the sheet the teacher opened, grants seeds, resets the progress, and shows the level id, its format and its generator seed. On a workshop it opens the editor, the test page and the corkboard and pins the level being made without playing it; on the comodín it opens its choices; it clears the levels made on this device (their plays and drafts too, never the seeds). It lasts for the browser tab's session.
