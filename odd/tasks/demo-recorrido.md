# Feature: demo-recorrido

Locator: `odd/tasks/demo-recorrido.md` (Engram mirror: project `camino`, topic `odd/demo-recorrido/tasks`)

## Objective

A playable demo of one unified kids' programming platform (sala de 4 → 3er grado) with two levels per grade, to test whether each grade's concept can be learned in this format before building the real platform.

## Problem

The school chains ScratchJr, Pilas Bloques, Code.org and Scratch. Each year changes tool, login, character and block vocabulary; concepts (repeat, if, events) arrive without a problem that makes them necessary; kids reach Scratch in 3rd grade with a "story" mental model that does not fit games.

## Scope (authorized 2026-09-27)

- New app in `~/projects/camino`. Visual language, character (Brote), drawing helpers, block shapes, drag/snap editor, board animation, speech and ghost hand are **copied** from `~/projects/habilidades` (commit `9b90d1d`, branch `feat/aprender-a-programar`). Never write to habilidades: another session works there.
- 10 levels: 2 per grade (sala 4, sala 5, 1ro, 2do, 3ro), as approved:

| Grade | Level 1 | Level 2 |
|---|---|---|
| Sala 4 | Direct control: big arrows take Brote to the seed | Same, avoiding a rock |
| Sala 5 | Plan 3 picture cards, then ▶ | 5-step plan: collect the seed and reach the goal |
| 1ro | Long path, not enough lines: ghost hand shows "repeat" | Staircase: repeat [→ ↑] |
| 2do | Fog: "repeat until goal" + "if rock, jump" | Same program must work in 3 worlds at once |
| 3ro | "When I press an arrow, Brote moves" (first game) | "Whenever Brote touches a seed, +1 point" |

- Out of scope: login, persistence, teacher view, offline/file:// delivery, level creation, Recreo/Muestra modes.

## Design rules (approved 2026-09-27)

1. One drawn universe: habilidades' paper/ink style (docs/05). No gradients, glass, generic icons, blurred shadows.
2. Full width, one row: narrow palette left, notebook program center, large board right. Sala 4 has no program: board takes almost the whole screen.
3. Exactly three persistent controls: ▶ Probar, ↺ Volver a empezar, ✋ Ayuda. No step button, zoom, menus, "see solution".
4. No reading required: instruction is spoken (🔊) and drawn; the title is for the adult.
5. Blocks grow with the kids: sala 5 picture only; 1ro picture + one word; 2do-3ro word + picture. Always stacked vertically, top to bottom.
6. Absolute arrow directions (↑↓←→). No relative turns.
7. Palette shows only the level's blocks. No categories.
8. Block limit shown without numbers: the notebook has exactly N lines/slots.
9. The running block is highlighted; failure is diegetic (Brote bumps/stops, the culprit block shakes). Never "incorrect".
10. New concepts are introduced by the ghost hand, no text. Tap-to-add equals drag. Touch targets ≥ 48 px.
11. Level progress: the tramo's pages at the top, completed with a stamp.

## Constraints

- Raspberry Pi: vitest with `--maxWorkers=2`; at most one writer at a time.
- Dev server on port 8797 (`--host 0.0.0.0 --strictPort`). 8795/8796 belong to habilidades.
- Artifacts (code, comments, docs) in English; kid-facing UI copy and spoken instructions in Rioplatense Spanish (es-AR), like habilidades.
- Advisory: ~400 authored changed lines per task is a planning heuristic, not a cap.

## Checks

- TDD: off (source: no project/session configuration; habilidades uses vitest but that does not enable TDD). Runner: vitest.
- Per task: `npm run typecheck`, `npm test`, `npm run build`, plus screenshots of every touched level reviewed by the parent (chromium headless; the 500 px clamp does not matter at desktop widths).
- RDD: off globally by the user (2026-09-23); no native review.

## Tasks

- [x] T1 — Scaffold + port the shell, style, Brote, board and editor from habilidades; level runtime and level-select page; Sala 4 (direct control) and Sala 5 (sequence) levels. Route: delegated direct (writer trigger: 2+ non-trivial files).
- [x] T2 — 1ro (repeat, slot-limited notebook, ghost-hand intro) and 2do (fog, repeat-until, if; three worlds at once). Route: delegated direct.
- [x] T3 — 3ro real-time rules engine: key events and "whenever touches" rules with a score; plus the T2 review fixes (a)-(d). Route: delegated direct.
- [x] T4 — Parent pass: full screenshot tour, fixes list, LAN test instructions for the user.

## Progress

- 2026-09-27: repo created (`main` empty root commit, branch `feat/demo-recorrido`). Feature document created.
- 2026-09-27: T1 done (delegated writer). Commits `bbc4e40` (scaffold + ported style), `104016c` (level runtime, engine, editor model, tests), `e29c013` (home, level screen, sala 4 and sala 5).
  - Checks: `npm run typecheck` clean; `npm test` 3 files, 45 tests passed; `npm run build` ok (JS 321 kB, 101 kB gzip). Screenshots of every level (idle, mid-run, bump, closed pot, short, win, help) at 1366×768, 1280×800 and 1920×1080 via `tools/shots.mjs`: no console errors, no horizontal or vertical page scroll.
  - Decisions: a pot that still waits for its seed is closed and Brote bumps its lid (diegetic "seed first"); direct mode (sala 4) has no Probar, only ↺ and ✋ plus the arrows; the bar shows the whole tramo (10 pages, pages of grades not built yet drawn dashed); failure marks are a small ink burst with a yellow star, never a red cross.
  - Runtime for T2/T3: add a `LevelDef` to `LEVELS` in `src/game/levels.ts`; commands `jump:<dir>`, `ifrock:<dir>` and loops (`count` number or `'goal'`) already run in the engine; palette ids `repeat` / `repeat-goal`; `worlds[]` and `fog` exist in the type but the UI draws `worlds[0]` only; `mode: 'realtime'` falls back to the program screen until T3.
  - Engram mirror pending (engram MCP resolves cwd ~/projects as ambiguous).

- 2026-09-27: T2 done (delegated writer). Commits `9b51f1f` (engine, levels, hints, lockstep, tests), `7929478` (block art and editor), `1628adf` (board: fog, look steps, lockstep gate), `e59b3b2` (level screen, home, shots tour).
  - Checks: `npm run typecheck` clean; `npm test` 5 files, 91 tests passed; `npm run build` ok (JS 339 kB, 106 kB gzip). T2 tour (`tools/shots.mjs … t2-`, 23 shots at 1366×768 and 1280×800) and the T1 tour again: no console errors, no page scroll. Scripted browser check: 2do-1 auto demo after a failed flat run builds `repetir hasta llegar [→]`; ✋ on a low count taps without editing; ✋ without a loop replays the 1ro-1 demo; the full-notebook demo plays once.
  - Levels: 1ro-1 (9×3, 8 steps, 3 lines, palette → + repetir), 1ro-2 (5×5 stairs lined by rocks, 3 lines), 2do-1 (9×1 strip in fog, rocks at 3 and 6), 2do-2 (three 8×1 strips, different rocks and goals). Tests prove no loop-free program fits and wins, the staircase only climbs with a repeat of → and ↑, no fixed list of steps and jumps solves the three worlds, and the fog hides seed and rocks at the start.
  - Decisions: `ifrock:<dir>` is an if-then ("si hay piedra [saltar]", a C-block with the jump fixed inside; nothing happens without a rock, Brote peeks), so 2do programs read `repetir hasta llegar [si hay piedra saltar, →]` and the order matters in 2do-2. A "repetir hasta llegar" gives up as soon as a pass starts where an earlier one did. The loop is not a card (N lines = N cards). The count cycles 2→10 on tap and shows as a digit plus dots on the foot (ten-frame rows of five), filled per pass. The concept demo makes real edits (↺, repeat in, card in, count tap) and leaves the idea, not the answer (1ro-1: ×3; 2do-1: without the "si"); ✋ help stays gesture-only. Three worlds run in lockstep; a sheet that wins alone gets a ring and a nod, confetti only when all three win; the culprit block gets a strip of the failing sheet's tape. Fog is revealed around Brote per step and fully after the run; it returns on the next run or edit.
  - Runtime for T3: `mode: 'realtime'` still falls back to the program screen. `move(board, state, dir)` is the one-step primitive (use it for key presses, as sala 4 does via `BoardView.playDirect`). `BoardView` has `play(trace, { onStep, gate, onDone, celebrate })`, `playDirect(step)`, `collect(i)` (pickups vanish with "¡Mía!"), `celebrate()`, `smallWin()`. Pickups are `Board.pickups` with a bitmask in `RobotState.mask`; a "+1 point" rule can reuse `applyCommand(...).collected`. No score or event model exists yet; `LevelDef` has no rule field.
  - Engram mirror pending (engram MCP resolves cwd ~/projects as ambiguous).

- 2026-09-27: T3 done (delegated writer). Commits `66186c9` (rule engine, rule-card model, 3ro levels, tests), `6e9ba33` (T2 review fixes (a)-(d), level pieces moved to `screens/levelKit.tsx`), `72129ea` (3ro game page, rule-card editor, home, shots tour, `tools/check-3ro.mjs`).
  - Checks: `npm run typecheck` clean; `npm test` 7 files, 123 tests passed; `npm run build` ok (JS 377 kB, 117 kB gzip). Commits `66186c9` and `6e9ba33` were each checked out alone in a worktree: typecheck clean, 123 tests passed. `tools/check-3ro.mjs` (real clicks, one mouse drag, keyboard arrows): arrows do nothing before ▶; a tap and a drag build → and ↑ cards; ▶ lights the lamp; ↓ without a rule leaves Brote at (3,1); the ↓ rule added mid-game reaches the seed (won, stamped, next page); 3ro-2 without a touch rule scores 0 after 16 s of chasing; the touch rule dragged in mid-game wins at 5; no console errors. T3 tour (`tools/shots.mjs … t3-`, 19 shots at 1366×768 and 1280×800) plus the T1 and T2 tours again: no console errors, no page scroll. Measured in the browser (Brote's box against his sheet during whole runs): 2do-1 stays 131 px inside, 2do-2 18 px inside (was 32 px outside before the low hop), 3ro-1 win 24 px inside.
  - Engine: pure `rtStep(board, def, rules, state, keys)` with 100 ms ticks; a step takes 5 ticks, at most 2 queued; keys without a rule are a `shrug` event; seeds from a seeded mulberry32 (never twice in a column), fall 0.045 rows/tick, touch window forgiving (both cells during a step); a touch rule takes the seed once, `score` actions count at once. Tests: key rule moves, missing rule no-op, touch scores once per seed, pass-through without a rule, spawner determinism, win at N, 3ro-1 reference rules win on the shortest key path (which needs ↓), → alone or → ↑ cannot win, 3ro-2 greedy chaser wins with ≤3 seeds in the air, no touch rule → score 0 under chasing and 20 random mashers.
  - Decisions: one hat per key (clearer than a key picker at 8, and the missing key's hat can wiggle); one card per trigger; up to 2 actions per card; rules may be edited while the game runs (the ↓ rule can be added the moment the shrug shows it missing); before ▶ an arrow only wiggles ▶. ✋ makes real edits (the brief asked for the hand to build the missing rule): it first removes what the reference lacks, then builds the first missing rule in the order the way needs (→ ↑ ↓ ←), then taps ▶, then shows the key to press. The page-1 intro (≈7 s, paced 0.7) builds "cuando aprieto → [→]", presses ▶ and →, and leaves the game running; it plays once per visit and plays while the instruction is spoken. Hats are event yellow with an antenna ear; "sumar 1 punto" is lilac and wider. Keys are keycaps in the keyboard's inverted T (only the keys whose hats exist: page 2 shows ← →). A touch collects the seed even if the rule has no actions (the empty line calls); no lose state; ■ Parar returns the world to its start with the rules kept; ↺ also restores the page's initial rules. Game boards get 128 units of headroom; the jar sits in a 150-unit right margin; the jar digit is Andika because a hand-drawn 5 reads as S.
  - T2 fixes: (a) the lone 2do-1 strip gets a pencil sky so its sheet fills more of the zone; the strip's cells cannot grow at 1366/1280 wide (the stage width is the limit), about 170 px stay free under the sheet at 1366×768. (b) 2do-1's jumps fit in the sky; on 2do-2's stacked strips Brote hops low (12/34 units), celebrates with nods, frame top 100. (c) confirmed: the strip sat at the culprit's top corner next to the loop header; it now crosses the culprit's right edge at mid height. (d) 1ro-2 is carved in stone: 16 `earth` cells drawn as one bricked mass with lighter treads, same solution and tests.
  - Known issues: the program editor (BlockEditor) takes its drag grip from the pointer after the 8 px threshold, not from pointer-down (the same bug was found and fixed in the rule editor by the browser check; not observed in program levels, left as is). Confetti of a win falls below short sheets (all levels). The home thumbnail of 3ro-2 shows a full inverted T of keys though the page has only ← →.
  - Engram mirror pending (engram MCP resolves cwd ~/projects as ambiguous).

- 2026-09-27 T4 (parent): reviewed T1–T3 screenshots (home, all 10 pages, fixes a–d). Re-ran `npm test` (7 files, 123 passed) and `npm run build` (ok). Dev server up on the LAN at http://192.168.1.37:8797 (HTTP 200). Open items carried forward, not blocking the demo: BlockEditor drag-grip bug, confetti below short sheets, 3ro-2 home thumbnail keys, ~170 px free under the 2do-1 strip, 1ro ghost intro ≈13 s may be long for 6-year-olds. Untested: real speech audio, real touch Chromebook, real kids.

## Next step

User tries the demo on the LAN and decides what to adjust; the demo is not pushed and not merged to main.
