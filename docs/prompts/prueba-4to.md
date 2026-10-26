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

**El enlace para abrir en cada computadora:** `https://camino-prueba.becode.com.ar/?grado=4`

Esta guía describe la ruta de 4to, la "Copa de 4to", en su segunda versión (Copa v2). Se rehízo dos veces: la primera mitad de 4to (clase del 2026-10-20) rechazó el Taller de juegos por aburrido y difícil de manejar, y después una primera Copa de circuitos de una sola ranura resultó demasiado recreativa y aislada. Lo que los chicos sí repitieron sin que nadie se lo pidiera fue la carrera de autos y la de escribir; la Copa v2 construye sobre eso.

### La idea, en una frase

**El auto se maneja solo; el chico es el ingeniero.** Arma un programa con bloques en el garaje, aprieta "¡Largar!" y mira cómo el auto lo ejecuta en la pista. Un solo programa va creciendo a lo largo de cinco copas, y cada copa trae pistas donde el programa que ya tiene deja de alcanzar, de modo que el concepto nuevo se necesita en lugar de explicarse.

- **En el garaje no corre ningún reloj.** Los rivales esperan en la línea de partida mientras el chico piensa. Pensar despacio no se castiga.
- **Los rivales dependen de la calidad del programa, no de la velocidad del chico.** Cada pista tiene tres tiempos objetivo (bronce: un programa que funciona; plata: uno bueno que no pierde tiempo; oro: el óptimo, el del zorro). Ganar siempre significa que el programa fue mejor, y la pantalla de resultado dice por qué.

### Lo que hacen los chicos, minuto a minuto

1. **"¿Cómo te llamás?"**: un campo grande para escribir el nombre (o una inicial si hay dos iguales). Es obligatorio en 4to, porque permite leer el nivel de cada chico después de la clase.
2. **El personaje**: elegir quién lo representa.
3. **La escalera corta** (hasta unos 8 minutos): empieza en el escalón 7, mide el nivel de entrada y se detiene sola cuando el chico deja de subir. **De su resultado sale la copa donde empieza la Copa** (ver "Ubicación").
4. **La Copa de 4to** (el centro de la clase, obligatoria): cinco copas, una por concepto. Empieza con el mapa de las copas, que muestra cada pista con su medalla y su mejor tiempo.
5. **El Arcade se abre solo** cuando ocurre lo primero de esto: el chico termina la copa 2, o pasan 20 minutos desde que empezó. Aparece un aviso grande ("¡Se abrió el Arcade!") y desde ahí hay un botón "Arcade" siempre a mano. En el Arcade hay la Carrera de teclas, el vestidor, el viejo Taller de juegos como una carta más, y "Tu mejor tiempo", que vuelve al mapa de las copas.
6. **La encuesta corta** (dos preguntas) aparece sola cuando el chico termina la copa 3 o a los 25 minutos, y nunca en medio de una carrera.
7. Después de la encuesta el chico sigue jugando la Copa y el Arcade hasta que termina la clase.

### Las cinco copas

| Copa | Idea nueva | Cómo la pide la pista |
|---|---|---|
| 1. Conocés la pista | una secuencia de bloques lleva al auto por la pista | el camino es fijo; subir, bajar y saltar el charco |
| 2. La pista no entra | `repetir` | la memoria del auto tiene 8 lugares y el camino es largo y con un patrón: solo entra con `repetir` |
| 3. La pista cambia | `si hay charco adelante / si no` | los charcos cambian de lugar en cada corrida (también en la revancha): el auto tiene que mirar antes de decidir |
| 4. Cosas que pasan de golpe | evento: `cuando cae un tronco` | un tronco cae en un momento que nadie sabe: un segundo programa se ejecuta aparte. Enseña la diferencia entre "un lugar donde se mira" (`si`) y "un momento que no se puede predecir" (evento) |
| 5. Gran Premio | variables (`nitro`, `vueltas`) | tres vueltas y tres nitros: usa todo lo aprendido junto |

La memoria del auto se ve como una fila de lugares numerados: cada bloque ocupa uno (un `repetir` o un `si` ocupa uno más los bloques de adentro). Si el programa no entra, el garaje lo dice con un aviso amable ("No entra") y no permite largar hasta que entre.

### El programa que crece

- **Dentro de una copa** el programa pasa de una pista a la siguiente tal como el chico lo dejó (si entra en la memoria de la nueva pista).
- **De la copa 3 a la 4 y de la 4 a la 5** el programa principal se conserva: la copa 4 agrega el carril del evento y la copa 5 agrega el turbo, el nitro y las vueltas.
- **De la copa 1 a la 2 y de la 2 a la 3** el chico empieza con el programa vacío, pero ve su programa anterior atenuado al costado ("Tu programa anterior") para consultarlo.
- El programa de cada pista se guarda en la computadora: si se recarga la página, el chico lo encuentra donde lo dejó.

### Qué significa un choque (y qué no)

**Un choque significa que el programa es incorrecto**, no que el chico perdió: el auto se detiene con humo, el bloque que falló se marca en rojo ("¡Acá chocó!") y el chico vuelve al garaje con el programa intacto. Patinar en un charco o ir lento **no** es un error: solo es más lento, y la pantalla de resultado lo cuenta ("patinaste 3 veces en charcos").

**"Ver paso a paso"** repite la última corrida despacio, iluminando cada bloque y diciendo qué pregunta hace cada `si` y qué respondió. Es la herramienta de depuración: conviene señalarla antes de dar cualquier explicación.

Terminar una pista en cualquier lugar la da por hecha: perder nunca bloquea el avance. **"¡Revancha!"** siempre está disponible; después de una derrota el siguiente rival es el del nivel de abajo, y después de una victoria el de arriba.

### Espiá el programa del zorro y Ayudá al ciervo

Son los pasos de "predecir" y "depurar" del diseño, integrados a la historia.

- **Espiá el programa del <rival>**: después de **perder**, el resultado ofrece espiar el programa del rival (el zorro, el coatí o el carpincho). El chico lo ve sin poder editarlo, con la pregunta grande "¿Dónde está el truco? Tocá el bloque", toca un bloque, se le dice cuál era (el bloque correcto se marca en verde), y después se anima la corrida del rival con el bloque en ejecución iluminado. Termina con "¡A tu taller!", que vuelve al garaje.
- **Ayudá al ciervo**: abre cada copa de la 2 a la 5. Se muestra el programa roto del ciervo, que corre y se choca; el chico lo arregla en el garaje (la memoria es el programa del ciervo más un lugar libre) y el ciervo llega a la meta. Después de dos corridas fallidas aparece la mano fantasma; después de cuatro se ofrece "Seguir sin arreglarlo".

### La ubicación inicial, "saltar" y la mano fantasma

- **Ubicación**: el techo de la escalera decide la copa inicial: hasta el escalón 4, copa 1; desde el 5 (pasó `repetir`), copa 2; desde el 9 (pasó las condiciones), copa 3. Nunca más tarde que la 3. Las copas anteriores siguen disponibles desde el mapa de las copas (botón "Copas").
- **Saltar**: si el chico termina la **primera pista** de una copa **en su primera corrida** y supera al menos el tiempo de plata, aparece un botón grande "¡Saltar a la copa siguiente!" junto a "¡Seguir!". Nunca se ofrece en la copa 5.
- **Mano fantasma**: después de **dos corridas fallidas seguidas** en la misma pista (un choque, un programa que se corta antes de la meta o uno que nunca termina), una mano señala solamente el **próximo** bloque (nunca el programa entero). Queda registrado, y el informe distingue las pistas resueltas con y sin mano fantasma.

### Qué decir cuando un chico se traba

La regla es **no dar la respuesta**: devolver la pregunta y señalar la herramienta.

- *El auto se chocó.* "¿Cuál es el bloque rojo? ¿Qué le pediste hacer ahí? ¿Qué hay en el camino en ese lugar?" y después "Probá Ver paso a paso".
- *El programa no entra en la memoria.* "¿Hay algo que se repite? ¿Cuántas veces?" (copa 2). No decir que use `repetir`.
- *Los charcos cambian de lugar* (copa 3). "¿Siempre están en el mismo lugar? Entonces, ¿el auto puede decidir antes de ir?".
- *El tronco* (copa 4). "¿Sabés cuándo cae? ¿Qué tiene que hacer el auto en ese momento?".
- *Perdió contra el zorro.* "Mirá lo que dice la pantalla que hizo distinto. ¿Querés espiar su programa?".
- *Lleva mucho tiempo sin avanzar.* Dejar que aparezca la mano fantasma antes de intervenir; si hace falta ayuda adulta, registrarla con el rincón del adulto (✋ mantenido 0,8 s).

### Los rivales honestos: se puede perder, y es a propósito

A diferencia de las otras actividades de Camino (donde el rival siempre deja ganar), en la Copa y en la Carrera de teclas de 4to el chico puede salir 2.º o 3.º si el programa no anduvo bien. Es intencional: el 2026-10-20 los chicos notaron que siempre ganaban y eso le quitó sentido al ganar. En la Carrera de teclas, los rivales se adaptan al ritmo del chico (un poco más lentos después de perder, un poco más rápidos después de ganar), de modo que quien escribe despacio no siempre pierde ni quien escribe rápido siempre gana; cuando nada de lo que hizo el chico explica la derrota, la pantalla lo dice con verdad ("esta vez el zorro vino más rápido"). Los rivales son siempre animales, nunca compañeros, y no hay ranking entre chicos.

### `/admin` y los botones de la clase

`/admin` (con la contraseña del docente) muestra, para cada chico: el nombre, el paso en que está y, en la Copa, **la copa y la pista actual con sus medallas** ("Copa 3 · pista 3-a · 2 oro, 1 plata"; "Copa 4 · ciervo" mientras ayuda al ciervo), o el escalón de la escalera, y si ya tiene el Arcade abierto. Hay tres botones de clase:

- **"Quedan 5 minutos"**: avisa y, cuando termina la corrida en pantalla, manda a cada chico a la encuesta y después al Arcade (o sigue en la Copa si el Arcade todavía no se abrió). Nunca interrumpe una corrida.
- **"Juegos para todos"**: abre el Arcade en todas las computadoras de inmediato.
- **"Terminar la clase"**: avisa con una cuenta regresiva de 10 segundos y después cierra la sesión.

**El rincón del adulto**: mantener apretada la esquina superior izquierda unos 0,8 segundos abre el menú oculto (terminar la sesión, registrar una ayuda, saltar un paso). El mismo gesto sobre el ✋ de la barra registra "¿en qué lo ayudó?" cuando se ayuda a un chico.

**El interruptor de Voz**: en el menú del rincón, "Voz sí/no" apaga solo la voz hablada de esa computadora (el texto en pantalla sigue, y los sonidos también).

### Después de la clase: cómo leer el informe

```
node tools/export-playtest.mjs
node tools/analyze-playtest.mjs exports/<archivo>.json --csv clase-4to.csv
```

El primer comando baja los datos de la clase; el segundo imprime el informe completo y escribe `clase-4to.csv` (una fila por chico). La sección **"Copa v2 (C10): el garaje"** muestra, por chico: la copa donde empezó, hasta dónde llegó y, por concepto (secuencia, `repetir`, `si / si no`, eventos, variables), si resolvió su pista propia, en cuántas corridas, cuántos choques tuvo antes de lograrlo y si la mano fantasma tuvo que mostrar el próximo bloque; si arregló al ciervo; y si acertó el truco en Espiá. El resumen de la clase cuenta cuántos llegaron a cada copa, el porcentaje que resolvió cada concepto **sin** mano fantasma, las causas de los choques, las revanchas voluntarias, quiénes usaron "saltar" y quiénes siguieron jugando la Copa después de que se abrió el Arcade.

La señal "entiende / a medias / copia o no llegó" de cada chico combina tres cosas: **crea** (resolvió su pista propia sin mano fantasma), **depura** (arregló al ciervo) y **lee** (acertó el truco en Espiá). La regla exacta se imprime al pie del informe.

### Qué mirar en la clase, en vivo

- **Quién copia y quién entiende**: un chico que arma el programa tocando bloques al azar hasta que algo anda, o que pide que se le diga exactamente qué tocar, probablemente esté copiando; uno que mira el bloque rojo, usa "Ver paso a paso" y cambia una sola cosa, probablemente entienda. El informe lo confirma después.
- **Los teclados de las Chromebook**: la Carrera de teclas acepta las palabras sin tilde (escribir "leccion" cuenta como "lección"), pero la ñ no aparece en el banco de palabras porque un teclado en inglés no la tiene.
- **El cambio de pestaña**: si un chico cambia de pestaña o minimiza para hacer otra cosa, el informe lo mide (tiempo con la pestaña oculta); no hace falta anotarlo a mano.
- **Alguien que pierde seguido y se frustra**: es más probable en las copas 2 y 4. Ofrecerle "Ver paso a paso" y "Espiá" antes de cualquier explicación.

## English: the redesign (why)

4to's route changed after the 2026-10-20 class (25 children, data from the first half of the grade) rejected the Scratch-like Game Workshop: it was impossible for most of them to drive (characters could not be deleted, too many things asked at once), and the children are already tired of Scratch at school. A median of 6 minutes went into the Workshop's first challenge, only 7 children ever solved challenge 3, nobody reached challenge 5, nobody earned the Arcade, and the survey never ran because the class ended first. The ladder's median ceiling was rung 8, with every struggling child walled at `repetir`/conditions. The two things the children replayed on their own, without being asked, were the typing race (92 voluntary "¡Otra carrera!") and 1ro's block race — both honest-feeling, fast-feedback activities, unlike the Workshop. They also noticed that every rival always let them win (the rubber band), which made winning feel hollow.

The redesign (`feat/copa-4to`, tasks C01–C05) keeps the measurement goal — a usable read of each child's level for planning 5to — but moves it into an activity the data says this group will actually play:

- **C01** fixed the two JS crashes seen live in class (`toLowerCase` of `undefined` in the typing race's key judge; a null `getBoundingClientRect` in the Workshop editor on a mid-drag unmount).
- **C02** gave 4to (only) honest, fixed-pace rivals instead of the rubber band, in both the typing race and a new reusable `honestRace.ts`, with a real result screen (place, margin, reason, "¡Revancha!").
- **C03** built the Copa de 4to itself: five kart circuits, each with one concept and one empty slot, racing live against the honest rivals on the same track view as 1ro's own race (not a bare quiz — an early pass that looked like one was reworked after review).
- **C04** wired the Copa into 4to's route as the mandatory step (replacing the Workshop's position; the Workshop stays reachable as an optional Arcade card), with the Arcade unlocking at circuit 2 or 20 minutes, and a shortened 2-question survey around minute 25.
- **C05** (this change) taught the class report to read the Copa's data and folded its concept results into the per-child evaluation for children who never reach the Workshop, and rewrote this guide for the new route.

This is a pilot hypothesis, not a settled design: whether honest, losable rivals actually keep this age group engaged (rather than discouraging the weaker half of the class) is exactly what the next class's data — revanchas, voluntary continuation after the Arcade opens, and whether a child who loses keeps playing — is meant to check. See `docs/next-iteration.md` §7 for the exception this carves out of Camino's general "nobody loses" rule, and for where it is marked as something to verify, not an established finding.

### Copa v2 (C06–C10): why the first redesign was redesigned

The first Copa (C03–C05: five circuits, each with one empty slot, raced live against fixed-pace animals) was reviewed on 2026-10-26 and two problems were found. Placing blocks against rivals that drive while the child thinks punishes thinking slowly; and single-slot circuits are too recreational and isolated ("connect two blocks and done"). The approved redesign:

- **You are the engineer, not the driver.** The kart drives itself with ONE program that grows across the whole Copa. Each copa brings tracks where the program so far stops being enough, so the new concept is needed instead of being requested (a memory of 8 places makes `repetir` the only way to fit a long track; puddles that move every run make `si` necessary; a log that falls at an unknown time makes an event script necessary).
- **Program first, race after.** The garage has no clock; the rivals wait at the line. A wall crash means a wrong program (the failing block is marked and the program is kept); skidding or a slow program is not wrong, only slower. **Ver paso a paso** is the debugging tool.
- **Rivals are tied to program quality.** Each track has bronze, silver and gold target times (the simulated times of a working, a good and an optimal reference program). A loss means the next rival is the tier below; a win, the tier above. Winning always means the program was better, and the result line says why from what the run actually did.
- **Predict and debug as part of the story.** After a loss, "Espiá el programa del zorro" asks where the trick is before the rival's run is shown; each copa from the second opens with "Ayudá al ciervo", where the deer's program has exactly one bug.
- **Pacing.** About five minutes per copa. The ladder's ceiling picks the starting copa (never later than the third); a first-run silver finish of a copa's first track offers to skip to the next copa; after two failed runs on a track the ghost hand shows only the next block. The ghost hand's use is data: a concept solved with it is shown, not made.
- **Typing race (Arcade).** Its rivals adapt to the child's pace (a bit slower after a loss, a bit faster after a win, clamped), so a very slow typist does not always lose and a very fast one does not always win; when the child's play does not explain a loss, the line says the rival was faster this time instead of blaming the child.
- **Measurement.** The per-child "entiende / a medias / copia o no llegó" signal is now `crea` (own track solved without the ghost hand) plus `depura` (the deer fixed) plus `lee` (the trick found in Espiá); the report prints the rule. As before this is a pilot hypothesis: whether this works for the weaker half of the class is what the next class's data (revanchas, voluntary continuation after the Arcade opens, ghost-hand use per concept) is meant to show.
