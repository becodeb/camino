# Feature: copa-4to

Locator: `odd/tasks/copa-4to.md` (Engram mirror: project `camino`, topic `odd/copa-4to/tasks`. Pending, because the engram MCP failed to connect on 2026-10-25. This repo doc is the record.)

## Objective

Rebuild the 4to route of the pilot so the second half of 4to enjoys it. The class becomes a "Copa de 4to": block-programmed kart races against animal rivals with fixed lap times, where you can really win or lose and the quality of your program decides the result. Each circuit adds one concept and leaves a single empty slot. The Arcade unlocks during the class.

## Problem

On 2026-10-20 the first half of 4to (25 children, export `playtest-2026-10-24-2352.json`) rejected the route. They found it boring, and they found the Scratch-like Workshop impossible and unintuitive: it asked many things at once, characters could not be deleted, and the children are burned out on Scratch. The data agrees. Workshop challenge 1 took a median of 6 min, 7 children solved challenge 3, nobody reached challenge 5, and nobody earned the Arcade. The median ladder ceiling was rung 8, with the wall at `repetir`/conditions. Nobody answered the survey because the class ended first. The two activities the children replayed without being asked were the typing race (92 voluntary "¡Otra carrera!") and 1ro's block race. The children also noticed that everyone always wins, because the rivals are rubber-banded.

## Why

The second half of 4to plays next. The goal is still to measure each child's level for planning 5to, using an activity they will actually play.

## Scope (authorized 2026-10-25: "bueno dale")

- Branch `feat/copa-4to` from `feat/prueba-piloto` (e9b6fbf), worktree `~/projects/camino-wt/copa-4to`. **Another agent modifies 1ro on `feat/prueba-piloto` at the same time.** Every change here is limited to 4to, or is additive behind a grade/mode switch. 1ro–3ro and 5to behave exactly as today. Shared files (`race.ts`, `Race.tsx`, `TypingRace.tsx`, `flow.ts`) get additive changes only, so the later merge stays small.
- Pushing the branch is allowed (public repo `becodeb/camino`, like the parent feature). Merge, deploy and PR are the user's decisions.

## Design (approved 2026-10-25)

4to route, a class of about 40 min:
`name → character → short ladder (cap 8 min) → Copa de 4to (5 circuits) → Arcade unlocks after circuit 2 or at minute 20, whichever comes first → 2-question survey inside the play at about minute 25 → end`.

- **Honest rivals (4to only):** the animals drive fixed paces in three tiers (bronze/silver/gold, like time-trial medals). A slow program comes 2nd or 3rd. The result screen shows the place, the margin and the reason ("te faltaron 3 s — el zorro usó turbo en la recta"), with **¡Revancha!** to replay. Rivals are animals, never classmates, and there are no rankings. This deliberately departs from `docs/next-iteration.md` §7 "no losing" for 4to only, and that exception is recorded there.
- **Copa circuits, one concept and one empty slot each:** 1 sequence (a wrong block crashes the kart and costs time); 2 `repetir` as the turbo (without it the fox wins); 3 `si hay charco / si no` (skid without it); 4 event `al aparecer un tronco → saltar`; 5 variable `vueltas` (3 laps, with `repetir`).
- **Typing race in the Arcade, honest for 4to:** rivals type at 6, 10 and 15 words per minute. The 4to median was 9.3.
- **Arcade:** typing race, wardrobe, and the old Workshop as an optional card. It also shows the child's best time per circuit. The admin "Juegos para todos" button keeps working.
- Fix the JS errors seen in class (`toLowerCase` of undefined ×7, `getBoundingClientRect` of null ×1).

## Constraints

- Raspberry Pi: one writer at a time; vitest `--maxWorkers=2`. Ports: same as the parent feature (8810/8811/54340); never kill 8797.
- Code, comments, docs and commits in English. Kid-facing copy in Rioplatense Spanish, large and inside the screen (4to ignores the top bar).
- Art drawn in code (SVG), following the existing race art.
- Advisory: about 400 authored changed lines per task is a planning heuristic, not a cap.

## Checks

- TDD: off (inherited from `odd/tasks/prueba-piloto.md`). Runner: vitest (`npm test`, `--maxWorkers=2`).
- Per task: `npm run typecheck`, `npm test`, `npm run build`, and screenshots at 1366×768 reviewed by the writer for UI tasks.
- RDD: off globally by the user.

## Delivery

Forecast: about 1200–1600 authored lines. Strategy: feature branch with work-unit commits, which the user merges into `feat/prueba-piloto` before a deploy.

## Tasks

Route: delegated direct (one writer at a time; each task touches 2+ non-trivial files).

- [x] C01 Fix the class JS errors (`toLowerCase` of undefined, `getBoundingClientRect` of null) from the 2026-10-20 bundle `index-D20pcTRl.js`.
- [x] C02 Honest rivals: a fixed-pace rival mode in `race.ts` (bronze/silver/gold), a result screen with place, margin, reason and ¡Revancha!, and honest typing race rivals (6/10/15 wpm). 4to only, with the rubber band unchanged for other grades.
- [ ] C03 Copa de 4to: 5 circuits with the concept blocks (`repetir` turbo, `si charco / si no`, event `al aparecer tronco → saltar`, variable `vueltas`), one empty slot each, plus events for the data.
- [ ] C04 4to route: short ladder (cap 8 min), Copa replaces the Workshop, Arcade unlock (circuit 2 or minute 20), old Workshop as an optional Arcade card, best times in the Arcade, 2-question survey at about minute 25.
- [ ] C05 Report and guide: `analyze-playtest.mjs` reads the Copa (place, margin, concept per circuit, revanchas), teacher guide in `docs/prompts/prueba-4to.md`, §7 exception note in `docs/next-iteration.md`.

## Progress

- 2026-10-25: feature document created, worktree and branch set up.
- 2026-10-25: C01 done (route: delegated direct, one writer). Root causes found by source reading, not by rebuilding the exact `index-D20pcTRl.js` hash (the lineage had already moved to `e9b6fbf`, so a byte match was not attempted): `judgeKey` (`src/playtest/typingRace.ts`) read `word[s.typed]` with no bounds check — after the race's last word is fully typed the kart keeps boosting to the finish line while `phase` is still `'input'`, so an extra keystroke in that window called `fold(undefined)` → `toLowerCase()` on `undefined` (7 logs / 6 sessions); fixed by having `judgeKey` return `'ignore'` for a missing expected letter, same as a key that types no letter. `Editor.wsPoint` (`src/workshop/Editor.tsx`, 4to's Workshop only) forced `wsRef.current!.getBoundingClientRect()`; a pointer-capture drag can deliver a trailing event after the editor unmounts mid-drag (a step change), so the ref was null once in class; fixed with an optional read and a zero-rect fallback (the two debug-only drag hooks get the same guard, bailing out instead). Commit `4582bce` on `feat/copa-4to`.
  - Verification: `npm run typecheck` clean. `npm test` → 59 files / 1367 passed (new test: a key with no letter left to type is ignored, not thrown). `npm run build` → built in 837ms, no errors (pre-existing unrelated warnings: the vite.config native-loader notice and the >500kB chunk size notice).
  - Open: the `getBoundingClientRect` fix addresses the only null-unsafe `wsRef.current!` site reachable from a live gesture; not reproduced locally with a real detach-mid-drag repro (no browser harness exists for the Workshop editor yet), so it is a defensive fix from reading the crash signature and the code, not a confirmed-by-repro one.
- 2026-10-25: C02 done (route: delegated direct, one writer). New: `src/playtest/honestRace.ts` (pure, unit-tested: fixed pace for both the typing race, in wpm, and a future block-race mode, in course units/s, calibrated against `race.ts`'s own `ZOOM_SPEED`/`TURBO_SPEED`/`BUMP_MS` by simulating good/okay/slow input policies over real `generateRace` output; `honestResult`/`honestRanking` turn two finish times into a place, margin and reason code; `resultLine` is the kid-facing Spanish line), `src/playtest/HonestResult.tsx` (the result screen: real places on T33's own podium art, big result line, "¡Revancha!" next to "¡Otra carrera!"). Changed: `TypingRace.tsx` gained a `rivals: 'band' | 'honest'` prop (default `'band'`, so every grade but 4to is byte-for-byte unchanged); honest mode drives the two rivals at a fixed wpm every frame instead of `stepRival`, computes the result once the child crosses, awards a cup/tier-up only on 1st place, and "¡Revancha!" replays the exact same seed (small seed-override/report plumbing, additive). `race.ts`/`Race.tsx` changed only to export `PodiumMe` (1 line) for reuse. `freePlay.ts` gained `raceRivalsFor(grade)` ('honest' for 4to, 'band' elsewhere), wired in `FreePlay.tsx`. `typing_race_start`/`_end` gained `rival_mode`, `revancha`, `place`, `reason` (`docs/prueba-piloto-datos.md` updated). Commit `cfd07e2` on `feat/copa-4to`.
  - Calibration: bronze/silver/gold = 0.45/0.75/1.1 course units/s (block race, future C03) and 6/10/15 wpm (typing race, per the design doc; the 4to pilot's own median was 9.3 wpm, between bronze and silver). `honestRace.test.ts` simulates GOOD (900ms/block, turbo taken, ~1 wrong total), OKAY (1500ms/block, no turbo, some errors) and SLOW (3200ms/block, no turbo, often >1 wrong a stretch) input policies over real `generateRace(tier, seed)` output for tiers 1-4 and checks: a good/turbo-taking program beats gold; a slow no-turbo one loses to bronze; a clean-but-no-turbo program still loses to gold on turbo courses 3-4 (turbo is what makes the difference, not raw typing speed); an okay program lands exactly between bronze and gold (2nd) rather than always 1st or always 3rd.
  - Verification: `npm run typecheck` clean. `npm test` → 60 files / 1390 passed (42 new tests: 22 in `honestRace.test.ts`, 1 in `freePlay.test.ts`'s new "honest rivals are 4to only" describe, plus incidental coverage). `npm run build` → built in ~1s, no errors. One unrelated flake noticed on a fresh full-suite run (`src/curriculum/primer.test.ts`'s sheet-14 test timing out at the default 5000ms under the Pi's full-60-file parallel load); confirmed pre-existing and not caused by this change — the file has zero diff from this branch, and the same test passes cleanly in isolation (`--maxWorkers=1`, 4.76s) and on a clean full-suite rerun.
  - UI (chromium, 1366×768, `PW=/home/opencode/.render-tools`, `/usr/bin/chromium`): started a local dev server on 8810 (stopped by PID afterwards, 8797 untouched), reached 4to's Arcade via `window.__piloto.jump('free_play')` + `window.__freePlay.pick('typing_race')` (both existing `?debug` hooks), typed every word through the real `window.__typingRace.key()` path (the existing `finish()` hook only types the last word, so it can't reach the `wordsDone === n` cross-line condition — learned this the hard way mid-session), and added one small DEBUG-only hook (`window.__typingRace.backdate(ms)`, mirroring the existing `idle` hook) to backdate the race's own clock past both rivals' fixed finish time, so a script that types everything right in milliseconds can still be judged a real, honest loss. Reviewed both screenshots myself: `shots/copa-4to/typing-honest-win-1366.png` (1st place, real wpm/accuracy numbers, a cup added) and `typing-honest-loss-1366.png` (3rd place, the coati and fox correctly on the gold/silver pedestals and the child's own character on bronze, "3ro — te faltaron 86 s. Te quedaste pensando mucho rato.", no cup added). Caught and fixed two real bugs this way before accepting the screenshots: the critter pedestal placement used the wrong transform math (an extra, wrong offset) and put the wrong critter on the wrong step; "¡Revancha!"'s mirrored kart art nested a `<g transform="scale(-1 1)">` outside any enclosing `<svg>` (a bare `<AgainArt/>`'s own `<svg>` wrapped in a `<g>` used directly inside a `<button>`), which React logs as "the tag <g> is unrecognized" — fixed with a CSS `transform: scaleX(-1)` on a plain wrapper `<span>` instead.
  - Open: 1ro's typing race path was not reached in this browser session (band mode is covered by `freePlay.test.ts`'s `raceRivalsFor` test and by every new honest-mode branch being gated behind `rivals === 'honest'`/`honestTiers`, defaulting to `undefined`/`'band'`, but not re-screenshotted). `PodiumMe`'s cheer/confetti animation plays on the result screen regardless of place (it is generic, reused art), so a 3rd-place result still shows a small cheer — harmless (the big text and the real pedestal carry the result) but a touch inconsistent; worth a look if a future pass touches `PodiumMe` itself. C03's Copa circuits are the first consumer of `honestRace.ts`'s block-race (course-units) pace table; it is unit-tested against `race.ts`'s existing tier table but not yet wired into any visible kart race.
