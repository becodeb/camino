# Handoff for new sessions

Read this first when continuing Camino in a fresh session: implementing another grade, the next iteration, or anything else. Everything a new session needs is in the repo, in the activities plan doc, and in the shared auto-memory; nothing lives only in an old conversation.

## What Camino is

A programming platform for one school, from sala de 4 to 3er grado, that replaces ScratchJr, Pilas Bloques, Code.org and the Scratch of 3ro, and leaves students ready for Scratch in 4to (or for a Camino game maker, still undecided). One drawn world, one character that grows with the student, one big concept per year, and each concept is born from a problem that makes it necessary.

The user is the school's programming teacher (they say "el profe"; refer to the teacher neutrally as "el docente") and also the developer behind becode. They write in Rioplatense Spanish, want short answers, one question at a time, and like to approve a plan before a big build ("planifiquemos primero, yo te doy el ok").

## Where things are

| What | Where |
|---|---|
| Activities plan for all five grades (17 sheets each, goals, frequent difficulties, how each sheet is presented) | Claude Docs "Plan de actividades de Camino": https://claude.ai/code/artifact/e39ce5de-2cab-45f4-a182-91e9f705a7bb (read it with the Claude Docs connector; it is the source of truth and the user may edit it) |
| Next iteration: accounts, class tools, suspended/short classes, adaptations, reports, help detection, motivation system, minigames, showcase rehearsal | `docs/next-iteration.md` |
| Pilot playtest prompt | `docs/prompts/prueba-piloto.md` |
| Presentation script for the school | `docs/guion-presentacion-1ro.md` |
| First demo (2 levels per grade) and the approved design rules | `odd/tasks/demo-recorrido.md` |
| 1ro's whole year: tasks, decisions, how-tos, evidence | `odd/tasks/primer-grado.md` |
| Visual style | `docs/style-guide.md`, `docs/screen-layout.md`, `docs/style-refs/*.png` (copied from habilidades, which is read-only: another session works there) |
| Code | `src/curriculum/*` (year model, sheets, generator, progress, motivation, workshop, showcase, presets), `src/game/*` (engine, formats, judge, music, guarda, rules), `src/screens/*`, `src/blocks/*`, `src/ui/*` (art, board views, ink), `tools/*` (screenshot tours and browser checks) |
| Deploy | https://camino.becode.com.ar — public repo `becodeb/camino`, Coolify app `camino` (branch `feat/primer-grado`, no auto-deploy: redeploy through the Coolify API after pushing). Local dev server: port 8797 |
| Auto-memory | `~/.claude/projects/-home-opencode-projects/memory/` (loaded by sessions started in `~/projects`): `plataforma-integral-programacion.md`, deploy notes, delegation traps |

Branches: `main` holds only the root commit; `feat/demo-recorrido` is the first demo; `feat/primer-grado` builds on it and is deployed. Merging to `main` is the user's decision.

## Approved decisions

### Concept spine and the world

| Grade | Zone | Character's power | Concept | Blocks | They create |
|---|---|---|---|---|---|
| Sala de 4 | House and yard | Move | One order, one action (direct control) | Big arrows, no program | Drawings with the footprint trail; hide the seed for a partner |
| Sala de 5 | Neighborhood and square | Memory | Sequence: plan before running | Picture cards, no words | Scenes that react when touched; paths for a partner |
| 1ro | Forest and river | "Otra vez" | Repeat | Picture + one word | Their own levels; levels with a block limit |
| 2do | Cave and underground lake | Eyes | Conditionals, repeat-until, one program for many worlds | Word + picture | Fog levels; challenges for a partner |
| 3ro | Fair (and the fair at night) | Antenna | Events and rules ("pasos vs reglas": a game is a set of rules, like "la mancha") | Rule cards: "cuando aprieto…", "siempre que…" | Their own game for the year-end fair |

Why this spine: today students reach Scratch in 3ro after three years of "a program is a story that runs once" and fail at games, which are rules that keep applying. Seeds of rules appear in sala de 5 ("cuando lo toco, salta").

### A year and a class

- About 17 real classes per year for 1ro–4to (one every two weeks, March to mid-December). Each year: about 12 camino sheets, 2 workshops, 1 recess, 1 comodín, 1 showcase. The first sheet reviews last year in the new zone; the first sheet after the winter break reviews the first half.
- Each class opens one **sheet** for everyone: a **core** of 3–4 short pages (1–2 marked **essential**), then three **doors** of generated extras of the SAME topic (fast students go wider, never ahead), and an optional handmade **boss** with a reward known in advance. Whoever missed a class or left essentials pending starts the next class with a personal **bridge**. Help appears by itself in three steps and never costs rewards.
- Five practice formats: solve, complete, fix, predict, save blocks (gold stamp).

### Design rules (approved, see `odd/tasks/demo-recorrido.md`)

The habilidades drawn universe (ink, paper, flat offset shadows, tape, no gradients); full width in one row (palette, notebook, big board); exactly three kid controls (▶ Probar, ↺ Volver a empezar, ✋ Ayuda); no reading required (the instruction is spoken and drawn); blocks grow from pictures to words; absolute arrows only (relative turns were rejected for young kids); the palette shows only the level's blocks; the block limit is shown as notebook lines; diegetic failure, never "incorrecto"; the ghost hand introduces concepts; tap-to-add equals drag; targets ≥ 48 px.

### Motivation rules

Progress is a growing world (garden, critters, wardrobe), not points. No rankings, no punishing timers, no attendance streaks, no random reward packs, no rewards for merely trying, seeds never spent, help never penalized. The wardrobe opens only when the teacher opens it (the last 5 minutes of class). Full design: `docs/next-iteration.md` §7.

### Language

Code, comments, docs and commits in English. Kid-facing copy and speech in Rioplatense Spanish. The teacher is "el docente".

## Implementing another grade (recipe)

1. Read the grade's section in the activities plan doc and this handoff. Check `docs/next-iteration.md` for anything that changes the structure.
2. Create `odd/tasks/<grade>.md` (objective, the 17 sheets, scope, art rule, constraints, checks, tasks) and a feature branch from the latest deployed branch.
3. Reuse what exists before building:
   - Sala de 4: the direct-control mode (the demo's sala 4 levels).
   - Sala de 5: the picture-card sequence mode (the demo's sala 5 levels) and the "cuando lo toco" idea.
   - 2do: fog, "si hay piedra", "repetir hasta llegar" and three worlds at once (the demo's 2do levels, `src/game/lockstep.ts`).
   - 3ro: the real-time rule engine and rule-card editor (`src/game/rules.ts`, `ruleEditor.ts`, `RealtimeLevel.tsx`, `RuleEditor.tsx`) and, for the close, the x/y crane idea from the user's "Operador de Grúa" project.
   - All grades: the year model and sheet screen (`src/curriculum/model.ts`, `SheetScreen.tsx`), the map pattern (`ForestMap.tsx`), the generator families (`generate.ts`), formats (`formats.ts`), the workshop and corkboard, the hub, the garden, critters, wardrobe, preview cards, showcase and dev presets.
   - How to add a sheet, a format, a page kind or a generator family is documented in the Progress entries of `odd/tasks/primer-grado.md`.
4. New art (the grade's map, zone boards, critters, outfit pieces) is designed by Opus with the style references; everything is drawn in code (SVG) with `src/ink/*`.
5. One writer at a time on the Raspberry Pi; vitest with `--maxWorkers=2`; commit each work unit as soon as its checks pass (container restarts happen); verify with typecheck, tests, build, screenshot tours and a scripted browser check; the parent re-checks screenshots.

## Process notes

- Workflow: the ODD protocol (feature document before the first write, one writer at a time, work-unit commits, honest evidence). RDD is off by the user's choice.
- Engram's MCP resolves `~/projects` as an ambiguous project and does not offer `camino`, so the Engram mirror of the feature docs is pending; the repo docs are the record.
- Writers must never write in `~/projects/habilidades`, never kill the dev server on 8797 (use 8798), stop servers by PID, and use Playwright from `PW=/home/opencode/.render-tools`.
- Deploy conventions for becode's Coolify (public repo, compose build pack, domain set after the first deploy, no auto-deploy, how to verify a deploy) are in the auto-memory notes `deploy-host-coolify-arm64`, `coolify-becode-api-token` and `detectar-deploy-coolify-no-por-hash`. The token is loaded with `set -a; . ~/.credentials/coolify-becode.env; set +a`, never read or printed.

## Open questions for the user

- The school's grading scale for 1ro (conceptual or numeric), for the automatic report.
- Sala de 4 and 5: how often and how long.
- Devices per grade and classroom internet reliability.
- How the school covers personal data once there are named accounts (the pilot is anonymous by design).
- Whether 4to replaces Scratch with Camino's own game maker.
