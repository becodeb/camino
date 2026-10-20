# Brief: the pilot for 4to grade

Self-contained brief for the round that prepares the pilot playtest (`feat/prueba-piloto`, `odd/tasks/prueba-piloto.md`) for a 4to-grade class. It can be executed by this session or by a fresh one: read this file, then the feature document (Design rules, Art rule, Constraints, Checks, Progress for T14, T15, T22, T25–T37), then `docs/next-iteration.md` §7.

Written 2026-10-19; the 4to class is on 2026-10-20.

## Who 4to is

- 9–10 years old, near the end of the school year. They have used Scratch with events and conditionals all year, but mostly **copied what the teacher showed** to build their games; events and conditions are still not understood.
- A hard group: not everyone is motivated, they are tired of Scratch, and they would rather play or open anything other than the activity. Keyboard racing games (like Cokitos' "Teclado en Español") always hook them.
- They are "big": anything that looks made for 6-year-olds (picture-first blocks, falling leaves, the 1ro xylophone) bores them. They read; but they ignore the top bar's caption bubble because it always holds text and it is rarely important. Important text must appear **large, inside the screen**.

## What the class must achieve

1. **A good measure of each child's programming level** (where 4to really is, who knows less than expected), useful to plan 5to next year.
2. **Evidence on whether Camino is viable next year**: do they engage, do they understand instead of copying, do they stay on task.
3. **A class they enjoy from start to end**: no dead time, challenge all the way, visible progress, a reason to finish.

## The 4to route (new, per grade)

`name → character → short tool check → long ladder → the Game Workshop (mandatory, with visible progress) → the Arcade unlocks → survey (with the adult) → end`. Teacher commands keep working (five_min, end_class, games_all). Today `STEPS`/`ROUTE`/`BUDGET_MS` are global constants (`src/playtest/flow.ts`); make them a function of grade, keeping 1ro–3ro and 5to exactly as they are.

- No falling-leaves typing game and no xylophone for 4to: typing lives in the Arcade as a race; the music card is removed for 4to.
- The wardrobe moves to the Arcade for 4to (optional).

## 1. The child's name (T38)

The teacher asked for each child's name so the level can be read per child and anyone who knows less than expected can be spotted.

- A first screen for 4to (and optional for every grade via `?nombre=si`, default on for 4to and 5to): "¿Cómo te llamás?" with a large text field (first name and, if repeated, an initial). Required for 4to; an adult can skip it from the corner menu.
- Stored in a new column `sessions.child_name` (migration), sent with the session record, shown in `/admin`'s live list (name, current step, ladder rung, workshop challenge, arcade unlocked), included in `tools/analyze-playtest.mjs`'s per-child output, exported as its own CSV column. Same retention as the rest (`RETENTION_DAYS`).
- Privacy note for the data dictionary: with a name the data is no longer anonymous; it is personal data of minors kept for the school's internal use; the school decides how it is covered (the user is part of the school). Never show a name to other children (no rankings).

## 2. A long, deeper ladder (T39)

The ladder was capped at 8 items / 8 minutes because it was never meant to fill a class. For 4to it becomes the main assessment: long while it stays challenging.

- 4to caps: up to ~18 items / 15 minutes; it still ends early at the child's ceiling (the existing floor/ceiling rules) so a struggling child is not dragged through failures. Per-item caps stay (3 min, 90 s idle).
- 4to entry at rung 7 as today, but with `word-picture` labels from the first item (no picture-first blocks for 4to).
- **Variants**: two different items per rung from rung 7 up (different board, same concept); a rung is passed with the first item, and a failed first item gets the second one before stepping down. This separates a lucky pass from understanding and gives more play.
- **New rungs 13–18**, built around understanding instead of copying (PRIMM: Predict, Run, Investigate, Modify, Make; Sentance et al., building on Use-Modify-Create, Lee et al. 2011):
  - 13 Predict an event script: a short realtime rule set is shown; tap where the character will be after pressing a key twice. Then it runs.
  - 14 Fix a buggy rule: "when the seed is touched, add a point" is wired to the wrong object; fix it.
  - 15 If/else: one rule with "si … si no" (e.g. the arrow key moves only if there is no rock ahead, otherwise the character jumps).
  - 16 Variables: a speed or points counter that changes the game (points up on each seed, speed up every 3 points).
  - 17 Broadcast: one object sends a message, another reacts.
  - 18 Modify then make: change a working mini game to a stated goal (e.g. "make it end when you get 5 points") with no ghost demo.
  The realtime engine (`src/game/rules.ts`) is fixed to `key:<dir>`/`touch:seed` hats and dir/score actions today; extend it additively (if-hat/condition, a variable, broadcast) or reuse the Workshop's VM (T40) for rungs 15–18 if that is cleaner. Every new item has a wordless first-time demo only for the *format* (never the answer).
- **Visible progress**: a climbing path (a mountain or a staircase with flags) beside the level showing the rungs climbed in this ladder.
- Data: `ladder_step` already logs rung, concept, format, pass/fail, help; add `variant` and per-concept results; the report prints a per-concept profile per child (sequence, repeat, conditions, events, variables, broadcast).

## 3. The Game Workshop: a small Scratch inside Camino (T40, the most important)

The game maker is the closest thing to what they will use next year, so for 4to it stops being one free-play card and becomes the mandatory heart of the class, with challenges that build an original game step by step, and real Scratch-like editing.

### Editor (Scratch-like, built new; the T15 rule-card editor stays for the other grades)

- A **free, scrollable workspace** per sprite: blocks can lie loose anywhere on the background; dragging a stack's top block carries the whole stack; dragging a block from the middle takes it and everything below; stacks snap together (below a block, above a hat-less stack, inside C-blocks); drop on the palette to delete; pan by dragging the background (and wheel/trackpad scroll); "ordenar" tidy button optional.
- Sprites list (the player, obstacles, seeds, the stage) with their own scripts; a stage with green flag and stop.
- Blocks with Scratch's Spanish wording and category colours, so what they learn transfers to Scratch (and back): events (`al hacer clic en la bandera`, `al presionar tecla [espacio]`, `al recibir [mensaje]`), motion (`mover (n) pasos`, `cambiar x en`, `cambiar y en`, `ir a x: y:`, `fijar y a`), control (`por siempre`, `repetir (n)`, `esperar (s)`, `si <> entonces`, `si <> entonces / si no`, `detener todo`), sensing (`¿tocando [objeto]?`, `¿tecla [ ] presionada?`, `(x)`, `(y)`), operators (`<`, `>`, `=`, `+`), variables (`puntos`, `vidas`, `velocidad`: `fijar … a`, `cambiar … en`, reporters), looks (`decir`, `mostrar`, `esconder`, `cambiar disfraz`), events (`enviar [mensaje]`), and game (`ganar`, `perder`).
- A small VM in pure TS: one cooperative thread per script, yielding each frame like Scratch (`por siempre`, `repetir`, `esperar`); rAF or a fixed tick; continuous coordinates; bounding-box touching; deterministic and unit-tested (scripts in, positions/variables out).

### The original game: "Al revés"

Not another catch-the-object or pong. A runner with **flipping gravity** (Geometry Dash / VVVVVV feel, which 9–10 year olds love): the character runs along a corridor; pressing space flips it to the ceiling (upside down) or back to the floor; spikes and logs come from the right on the floor and on the ceiling; seeds give points; the game speeds up. Easy to understand, quick to play, hard to master, and every step needs a real concept:

| # | Challenge (what the child is asked) | Concept | PRIMM step |
|---|---|---|---|
| 1 | "Que el mundo corra": the floor and an obstacle move left forever and come back from the right | `por siempre`, motion, `si x < … entonces ir a x:` | Predict then Run |
| 2 | "Que dé vuelta": pressing space flips the character | events + `si … si no` | Investigate a buggy script (it only goes up) and fix it |
| 3 | "Trampas arriba y abajo": add a ceiling obstacle | duplicate + modify a script | Modify |
| 4 | "¡Auch!": touching an obstacle takes a life and blinks | `¿tocando?`, variables | Make (with a hint) |
| 5 | "Puntos": each seed gives a point | variables, `al recibir` | Make |
| 6 | "Cada vez más rápido": every 5 points, more speed | variable inside an expression | Modify |
| 7 | "Ganar o perder": 0 lives → lose, 20 points → win | conditions on variables | Make |
| 8+ | Free challenges: double obstacles, a moving bird, a power-up, a sound, a new costume, their own idea | everything | Make |

- Each challenge opens with its goal **large inside the screen** (not in the bar) and a short animated preview of what it should look like. Predict steps ask a tap answer before running; investigate steps ask to tap the block responsible. No ghost demo gives the solution; help is graded (hint → highlight the relevant block → show a similar example).
- **Visible progress**: a challenge strip with stars and the game growing beside it; the child's own game is playable at any moment (play button), and after challenge 5 it appears in the Arcade as "Tu juego" with its best score.
- Data: per challenge `workshop_challenge {n, phase, predict_correct, investigate_correct, attempts, help_level, ms, solved}`, `workshop_edit` (block added/moved/removed, stack sizes), `workshop_run`; the report derives an "understands vs copies" signal per child (predict/investigate accuracy, modifications solved without help).

## 4. The Arcade (T41)

Opens in the workshop's menu when the child has finished challenges 1–5 (completion, never speed), and for everyone with "Juegos para todos" in the last minutes. Children who finished early play more, but nobody is left out and rushing gains nothing.

- **Carrera de teclas**: the T33 track and karts, driven by typing: a word or short phrase appears large under the track (programming words and phrases for 4to: `repetir`, `si tocando`, `por siempre`, `cambiar puntos en 1`…); every right letter nudges the kart, a finished word gives a boost, a wrong letter makes the kart wobble (nothing lost); rubber-banded rivals so the child wins by a little; tiers by word length; endless "¡Otra carrera!". Measures words per minute and accuracy.
- **Tu juego**: their own "Al revés" with a best score to beat.
- **La carrera** from tier 4 (turbo straights), plus the wardrobe as an optional extra.
- The Workshop stays one tap away: a child can go back and keep doing free challenges.

### Is unlocking games a good technique for this group?

Yes, with conditions. Expected rewards for an activity already interesting to the child can undermine intrinsic motivation (Deci, Koestner & Ryan 1999, meta-analysis of 128 studies), but rewards for low-interest tasks, as Scratch is for this tired group, tend to enhance free-choice motivation (Cameron, Banko & Pierce 2001), and informational positive feedback raises it (Deci et al.: d = 0.33). So: unlock by completing the workshop's core challenges (not by speed), keep the Arcade open to everyone at the end, make the progress feedback informational (stars, the growing game), and let their own game be one of the Arcade's games, so the reward points back at what they built.

## 5. Survey and in-screen text (T38)

- For 3ro and up, every survey question shows its text large inside the card (and every step change that matters — the workshop's goal, the arcade unlocking — appears inside the screen, never only in the bar).

## 6. Evaluation for next year (T42)

`tools/analyze-playtest.mjs` gains a per-child table for 4to (name, ladder ceiling and per-concept results, workshop challenges solved and how — predicted/investigated/with help —, typing speed, time on task vs time with the tab hidden, help asked) and a class summary: the expected entry level for 5to (the rung most children reached), who is well below it, which concepts are weakest, and engagement indicators (time on task, voluntary continuation in the workshop after the arcade opened, off-task time).

## Order, sizes and cut line

One writer at a time on the Raspberry Pi; each task closes with checks, screenshots reviewed by the parent, and a work-unit commit.

1. **T38** name + `/admin` by name + survey text in screen (small).
2. **T40** the Game Workshop (large; the most important). Writer on the strongest model.
3. **T39** 4to route per grade + the long ladder with variants and rungs 13–18 + the progress path (medium-large). Wires the route to T40.
4. **T41** the Arcade: typing race, "Tu juego", unlock rules (medium).
5. **T42** report per child + a full scripted 4to session end to end (setup with a name → ladder → workshop → arcade → survey) at 1366×768 and 1280×800; then redeploy on the user's request.

Cut line if time runs out before the class: T38 and T39 must ship; T40 ships with at least challenges 1–5 working; T41's typing race can wait (then "Juegos para todos" opens La carrera and "Tu juego"). Never deploy a half-working workshop: if T40 is not solid, 4to's route falls back to the current "Hacé tu juego" as its mandatory step behind a flag.

## Guía rápida para el docente — 4to

**El link para abrir en cada compu:** `https://camino-prueba.becode.com.ar/?grado=4`

**Lo que van a ver los chicos, en orden:**

1. **"¿Cómo te llamás?"**: un campo grande para escribir el nombre (o un inicial si hay dos con el mismo nombre). Es obligatorio para 4to — así se puede leer el nivel de cada chico después de la clase.
2. **El personaje**: elegir quién los representa.
3. **Un chequeo cortito de la herramienta**: cinco gestos simples con el lápiz y el tablero (tocar, probar, arrastrar…), unos 30–70 segundos.
4. **La escalera larga**: hasta 18 escalones o 15 minutos, empieza en el escalón 7. Se frena sola apenas el chico deja de poder subir (no los hace repetir fracasos).
5. **El Taller de juegos** (lo más importante de la clase): arman su propio juego "Al revés" paso a paso, como en Scratch, con 7 desafíos centrales. Al resolver los primeros 5 se abre el Arcade.
6. **El Arcade**: Carrera de teclas (escriben palabras de programación para ganarle a dos rivales que nunca los dejan perder), "Tu juego" (jugar lo que armaron en el Taller), La carrera (de autos), y el vestidor, opcional.
7. **La encuesta** y listo.

**`/admin`** (con la contraseña del docente) muestra, para cada chico: su nombre, en qué paso está, el escalón de la escalera o el desafío del Taller en el que está, y si ya tiene el Arcade abierto. Hay tres botones de clase:
- **"Quedan 5 minutos"**: avisa y, cuando termina el ítem en pantalla, manda a cada chico a la encuesta y después al Arcade (o al Taller si todavía no lo abrió).
- **"Juegos para todos"**: abre el Arcade en todas las compus ya, aunque el chico no haya terminado el Taller (no le pone la bandera verde: eso solo se gana resolviendo los primeros 5 desafíos).
- **"Terminar la clase"**: avisa con una cuenta regresiva de 10 segundos (el chico puede seguir jugando esos 10 segundos) y después cierra la sesión.

**El rincón del adulto**: mantené apretada la esquina superior izquierda de la pantalla unos 0,8 segundos para abrir el menú oculto (terminar la sesión, registrar una ayuda, saltar un paso). El mismo mantener apretado (~0,8 s) sobre el ✋ de la barra registra "¿en qué lo ayudaste?" cuando ayudás a un chico.

**El switch de Voz**: en el menú del rincón, "Voz sí/no" apaga solo la voz hablada (el texto en pantalla sigue, y los sonidos y la música también); es por compu, así que si un chico molesta a los demás hablando fuerte podés bajarle la voz a esa sola máquina sin tocar el volumen general.

**Después de la clase, cómo leer el informe:**

```
node tools/export-playtest.mjs
node tools/analyze-playtest.mjs exports/<archivo>.json --csv clase-4to.csv
```

El primer comando baja los datos de la clase; el segundo imprime el informe completo (por chico y el resumen de la clase) y además escribe `clase-4to.csv`, una tabla con una fila por chico, para abrir en una planilla.

**Qué mirar en la clase, en vivo:**
- **Quién copia vs. quién entiende**: en el Taller, si un chico arrastra bloques sin mirar el tablero, prueba al azar, o te pide que le digas exactamente qué tocar, probablemente esté copiando más que entendiendo — el informe después lo confirma con la señal "entiende / a medias / copia o no llegó".
- **Los teclados de las Chromebook**: la Carrera de teclas acepta las palabras sin tilde (escribir "leccion" cuenta como "lección"), pero la ñ no aparece en el banco de palabras porque un teclado en inglés de Chromebook no la tiene — no es un error si un chico no la encuentra.
- **El cambio de pestaña**: si un chico cambia de pestaña o minimiza para hacer otra cosa, el informe lo mide (tiempo con la pestaña oculta); no hace falta anotarlo a mano, pero si ves que pasa mucho en una compu puede valer la pena mirar esa pantalla.
