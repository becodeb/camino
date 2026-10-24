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

- [ ] C01 Fix the class JS errors (`toLowerCase` of undefined, `getBoundingClientRect` of null) from the 2026-10-20 bundle `index-D20pcTRl.js`.
- [ ] C02 Honest rivals: a fixed-pace rival mode in `race.ts` (bronze/silver/gold), a result screen with place, margin, reason and ¡Revancha!, and honest typing race rivals (6/10/15 wpm). 4to only, with the rubber band unchanged for other grades.
- [ ] C03 Copa de 4to: 5 circuits with the concept blocks (`repetir` turbo, `si charco / si no`, event `al aparecer tronco → saltar`, variable `vueltas`), one empty slot each, plus events for the data.
- [ ] C04 4to route: short ladder (cap 8 min), Copa replaces the Workshop, Arcade unlock (circuit 2 or minute 20), old Workshop as an optional Arcade card, best times in the Arcade, 2-question survey at about minute 25.
- [ ] C05 Report and guide: `analyze-playtest.mjs` reads the Copa (place, margin, concept per circuit, revanchas), teacher guide in `docs/prompts/prueba-4to.md`, §7 exception note in `docs/next-iteration.md`.

## Progress

- 2026-10-25: feature document created, worktree and branch set up.
