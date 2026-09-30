# Prompt: Camino pilot playtest ("prueba piloto")

Paste this whole file into a new Claude Code session started in `~/projects`, or send: "Leé y ejecutá `~/projects/camino/docs/prompts/prueba-piloto.md`".

---

You are building a **pilot playtest** of Camino, a programming platform for young children, in `/home/opencode/projects/camino`. Children from 1ro to 5to grado will play it for 20–40 minutes each so we can learn what they already know, what they understand, what they enjoy, and which new ideas work. Every session writes anonymous data to a database we will analyze later.

## Read first

1. `docs/handoff.md` (what Camino is, where everything is, the approved decisions, process notes). Follow it.
2. `docs/next-iteration.md` (the motivation system and minigames you will test here).
3. `odd/tasks/primer-grado.md` (how 1ro's year was built; how to add a sheet, a format, a page kind, a generator family) and `odd/tasks/demo-recorrido.md` (the approved design rules and the 2do/3ro demo levels).
4. The style: `docs/style-guide.md`, `docs/screen-layout.md`, every image in `docs/style-refs/`.
5. The auto-memory notes about becode's Coolify: `deploy-host-coolify-arm64`, `coolify-becode-api-token`, `detectar-deploy-coolify-no-por-hash`, `kodu-coolify-deploy-unificacion` (volumes), and `delegacion-escritores-trampas`.

## Authorization and boundaries (from the user)

- Work on a new branch `feat/prueba-piloto`, branched from `feat/primer-grado`, in the existing public repo `becodeb/camino`. Push that branch.
- Deploy it as a **separate** Coolify app on becode's Coolify (compose build pack), domain `https://camino-prueba.becode.com.ar` plus its sslip.io URL, using the token in `~/.credentials/coolify-becode.env` (load it with `set -a; . <file>; set +a`; never read, print or commit it). Do not touch the existing `camino` app.
- Secrets (database password, admin token, export token) go only in Coolify environment variables and in a local file `~/.credentials/camino-prueba.env` (chmod 600) for later analysis. Nothing secret in git: the repo is public.
- Never write in `~/projects/habilidades`. Never kill the user's dev server on port 8797. Stop your own servers by PID.
- Follow the ODD protocol: create `odd/tasks/prueba-piloto.md` before the first source write; one writer at a time on this Raspberry Pi; commit each work unit as soon as its checks pass; all new art designed by Opus with the style references; code/comments/docs/commits in English, kid-facing copy and speech in Rioplatense Spanish; refer to the teacher as "el docente".

## Who will use it, and when

- A few children of different ages (1ro to 5to) at a time, with an adult next to them, for 20–40 minutes.
- Also the teacher's next class with each course (1ro to 4to): children who finish early will play it, several devices at once, one adult (the teacher) for the whole room.
- It is late September: the children are in the middle of their current year (1ro–2do use Pilas Bloques and Code.org, 3ro–4to Scratch, 5to MakeCode Arcade and micro:bit). They are the same children who will use Camino next year.
- Progress does not need to survive the session. Content is not a class: anything goes, as long as it teaches us something.
- Devices: school PCs, touch Chromebooks, maybe tablets; screens around 1280×800 and 1366×768; classroom internet drops.

## What we want to learn (research questions)

Design the flow and the data so each question can be answered per grade:

1. **Tool skills:** can each grade drag and drop without help? How much do they use tap-to-add instead? How often does a failure come from the tool (drag, not hearing the instruction, not seeing the goal) rather than the concept?
2. **Prior knowledge:** how far does each child get on the concept ladder (sequence, long sequence, fix/predict, repeat, repeat with a pattern, steps before/after a repeat, "si" in fog, one program for three worlds, events, rules with a score)? This calibrates next year's starting points and the "express sheets".
3. **Help:** which help level do they reach; does the ghost-hand demo lead to success on the next try; how often do they replay the spoken instruction (🔊); how often do they call the adult, for what (instruction, tool, goal, concept), and did each success come alone or after the adult's help?
4. **Formats:** success and time for solve, complete, fix, predict and save-blocks, by grade.
5. **Engagement:** what they choose when free to choose, time per activity, retries, voluntary extras, the door difficulty they pick, idle periods, when attention drops within 20–40 minutes.
6. **Motivators:** character chosen, time and choices in the wardrobe, interest in seeds, rewards and the garden.
7. **Typing minigame:** accuracy and speed by grade, and whether they like it.
8. **4to and 5to probes:** can they build a small game with rules, score, lives and messages in about 10 minutes, and do they like it (a possible Scratch replacement for 4to)? Can 5to read and edit the text version of a block program (readiness for text and Python)?
9. **Self-report:** did they like it, was it easy or hard, favorite activity, do they want to play again.

## Session flow

A new app mode reachable at the root of the playtest deploy (keep the existing demo intact in the code base).

0. **Adult setup (one screen, fast):** grade (1ro–5to) and optional division letter, nothing else. The app creates an anonymous **session code** (an animal and a number, e.g. "Zorro 27") and shows it large so the adult can match it with their own observation notes, then hands over. Never ask for or store names: the data is anonymous by design. If the teacher wants to follow individual children, the names stay on the teacher's paper, never in the app.
1. **Character choice** (Brote, Mina, Pliegue, Ovillo) — the existing sheet-1 choice.
2. **Tool check (1–2 min):** tap, drag, ▶, ↺ and ✋ on two tiny levels; record drag attempts, successes and taps.
3. **Placement ladder (8–12 min):** a FIXED item bank (the same items for every child, so data is comparable; never random extras here), built from existing content: 1ro's sheets (sequence, fix, predict, complete, repeat, pattern, before/after), the demo's 2do levels (fog "si", three worlds) and 3ro levels (key rules, touch rule with score). Entry point by grade (1ro: short sequence; 2do: long sequence; 3ro: repeat; 4to: repeat pattern; 5to: fog "si"). Step up after a success without the solution hint; after two failures or the solution hint, try one easier item to confirm the floor, then stop the ladder. At most about 10 items or 12 minutes. Record per item: concept, format, attempts, runs with each program as run, help levels used, time, result.
4. **Free play (10–15 min):** a drawn menu of 3–4 activities adapted to the grade, chosen freely (record every choice): a full 1ro sheet with its doors and boss; the music recess; the guardas; the level editor and the corkboard; for 3ro–5to the rule game; for 4to the game-maker probe; for 5to the text probe.
5. **Typing minigame (3–5 min), new:** "Teclas del bosque". Seeds or leaves fall carrying letters; pressing the key catches them. 1ro: vowels and common letters; 2do: short words; 3ro and up: short commands ("si", "repetir") and words. A drawn keyboard highlights the key. Speed adapts; there is no losing and no punishing countdown. Record key, expected, correct, latency.
6. **Wardrobe (2–3 min):** outfits unlocked by the seeds earned in this session (compress the thresholds so every child unlocks something). Record time and choices.
7. **Survey (1 min):** spoken questions answered with drawn faces or pictures: ¿Te gustó? (3 faces), ¿Fue fácil o difícil? (3 faces), ¿Qué te gustó más? (tap the pictures of the activities they did), ¿Querés volver a jugar? (sí / no).
8. **Goodbye:** their character, their session's garden, the session code again.

The adult can end the session at any time with a hidden control (long-press on a corner); that jumps to the survey. After the child leaves, a short adult form: engagement (3 levels), help needed (none / some / a lot), free comment.

### Help from the adult

Children will ask the adult for help when they don't understand something or can't do it, and the data must tell a solo success from an assisted one.

- ✋ first gives the automatic help (its three steps). After the last step, or when the child keeps ✋ pressed, their character raises a big hand on screen, visible from across the room, so in class the teacher sees who is waiting and in what order. Log `call_adult`.
- The adult resolves it with a hidden gesture (long-press on the raised hand) and taps what they did: explained the instruction, showed how to use the tool (drag, ▶), gave a hint, or solved it together. Log `adult_help` with that kind and its duration. The adult can also log help that happened without a call (long-press on a corner).
- Every level result records whether adult help happened during it.

### New probes for 4to and 5to

- **4to, "Hacé tu juego":** extend 3ro's rule engine into a tiny game maker: two or three objects with their own rules, score and lives, a win/lose condition, and "avisar" (one object sends a message, another reacts: Scratch's broadcast). A guided start (play a ready game, change one rule, then make your own variant). Show the equivalent Scratch blocks next to their rules (the "Traductora" idea) and ask them to predict what a Scratch script does.
- **5to, "Del bloque al texto":** the same small program shown as blocks and as Python-like text side by side (`for i in range(3): avanzar()`, `if hay_piedra(): saltar()`). Tasks: predict what a text program does, change a number in the text, fix a typo. Measure whether they can read and edit it.

## Data

- **Anonymous by design:** session code, grade, division letter, device info. No names, no photos, no audio, no free text from children. Under Argentina's Ley 25.326 (art. 2), data that cannot be tied to a determined or determinable person is not personal data: keep it that way.
- Tables (PostgreSQL 16):
  - `sessions`: id (uuid), code, grade, division, consent, started_at, ended_at, end_reason, app_version, device (user agent, screen size, touch capable), survey (jsonb), adult_form (jsonb).
  - `events`: session_id, seq (per session), client_t, server_t, type, payload (jsonb); unique (session_id, seq) so retries are idempotent.
  - Event types at least: tool_check, level_start, run (the program as run, its result: win, bump, short, wrong note, smudge…), level_end (outcome, time, attempts, help levels, blocks vs optimal), help, ghost_demo, call_adult, adult_help (kind, duration), speak (🔊), drag (start, drop, success), tap_add, choice (activity, door), ladder_step (concept, item, result, next), typing (key, expected, correct, latency), wardrobe, garden_view, survey_answer, idle (no input for 30 s), visibility (tab hidden or shown), error (client JS errors).
- **Offline queue:** events are stored locally first and sent in batches with retries, so a dropped connection loses nothing; the session still works fully offline and syncs later.
- **Admin page** (protected by `ADMIN_TOKEN`): live list of sessions (grade, duration, where each child is), counts per grade, and CSV/JSON export.
- **Export for analysis:** `GET /api/export?format=json|csv` protected by `EXPORT_TOKEN`, plus `tools/export-playtest.mjs` that reads the token from `~/.credentials/camino-prueba.env` and writes a dated file. A later session will analyze the data with it.
- **Data dictionary:** `docs/prueba-piloto-datos.md` (every table, column and event type, and which research question each one serves) and a few ready SQL views or a summary script: per-session summary, ladder ceiling per child, time per activity, typing accuracy by grade.
- **Retention:** a `RETENTION_DAYS` setting (default 180) and a documented way to delete everything.

## Tech

- Reuse the Camino front end (same Vite + React + TypeScript app, a new mode or entry for the playtest).
- A small Node API (Hono or Fastify) that serves the built front end and `/api`, with idempotent SQL migrations run at start.
- `docker-compose.prueba.yml` and `Dockerfile.prueba` at the repo root (the existing `docker-compose.yml` of the demo stays untouched): services `app` (Node) and `db` (`postgres:16-alpine`, named volume, healthcheck). No published ports and no external networks (Coolify adds its proxy). Base images must be multi-arch. BuildKit cache mounts are not available on that Coolify.
- Self-host the fonts (Andika, Gochi Hand; both OFL) so children's devices do not call Google Fonts.
- Test it locally first with `docker compose -f docker-compose.prueba.yml up` on a free port (8797 and 8798 are taken, 8080 is taken, 5432 is taken).

## Verification

- `npm run typecheck`, tests with `--maxWorkers=2` (the API against a real Postgres from the compose file or a disposable container), `npm run build`.
- Screenshot tour of every step at 1366×768 and 1280×800 for 1ro, 3ro and 5to, reviewed with the Read tool.
- A scripted browser check (Playwright at `PW=/home/opencode/.render-tools`, chromium at `/usr/bin/chromium`) that plays a full 1ro session and a full 5to session end to end, including an offline stretch, and then confirms the rows in the database and the export.
- After deploying: the same check against `https://camino-prueba.becode.com.ar`, the Coolify status `running:healthy`, and the export working with the token.

## Priorities if time runs short

1. P0: adult setup, session code, event pipeline with offline queue, database, export, deploy.
2. P1: tool check, placement ladder, survey, adult form.
3. P2: free-play menu with the existing activities, wardrobe step, typing minigame.
4. P3: the 4to and 5to probes.

## Final report to the user (in Spanish, short)

The playtest URL; how to run a session step by step (for one child with an adult, and for several fast finishers in class); the admin page and where the tokens are; what was verified; what was not; and that the data is anonymous by design (if the teacher follows individual children, the names stay on paper in the school).
