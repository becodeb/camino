# Next iteration: requirements and design decisions

Status: **not implemented.** Requirements the user gave between 2026-09-27 and 2026-09-30, plus the design proposed for them. Implement after the pilot playtest (`docs/prompts/prueba-piloto.md`) and its analysis. Kid-facing copy stays in Rioplatense Spanish; refer to the teacher neutrally ("el docente") — the user speaks of "el profe", never assume "la maestra".

## 1. School structure the platform must model

- A **division** (e.g. "1ro A") has about 25 students. From 1ro to 4to the division is split in two halves that alternate weeks: half A has programming one week, half B the next. Both halves are **one group**: same roster, same year plan, same teacher view. Students move between halves (and occasionally between divisions) without losing anything.
- 1ro–4to: one hour every two weeks per student, in groups of about 15 (a half). 5to, 6to and 1er año: the whole division, one hour per week. Sala de 4 and 5: schedule unknown (open question).
- School year: March to mid-December, about 39 teaching weeks without the winter break. For a student in 1ro–4to that is about 19 possible classes, about 17 real ones, about 14 effective hours.
- Progress is **per student**, never per half. A class **session** belongs to the division and to whoever logs in; the "sheet opened by the teacher" is a property of the session, so half B can be a week behind half A without any special case.

## 2. Accounts and roles

- **Superadmin** (the platform owner) creates **organizations** (schools).
- An organization has **teachers**. Org admins are teachers with the admin role; they invite other teachers and manage everything in the school.
- Admins and teachers create **divisions** (grade, letter, school year, halves), load **students** (paste a list or import CSV), print login cards, assign teachers to divisions, and move students between halves and divisions. A student keeps their history across years.
- Student login:
  - 1ro: tap the division, tap your avatar, enter a picture password (the school already uses picture passwords in Code.org).
  - 2do and up: typed username + simple password from a printed card (2do is when the school wants them to gain autonomy with the computer).
  - The typely project already has this role model (superadmin / admin / docente / alumno) and username + printed-password login; reuse the pattern.
- Data: minimum personal data (first name + initial), owned by the school, exportable and deletable, no ads, no third-party analytics. Progress is saved locally first and synced when the classroom internet comes back (it drops).

## 3. Class session and teacher tools

"Modo clase", on the teacher's device:

- **Start class:** pick the sheet (defaults to the next one) and the **real duration** (60 min by default, shorter when needed). A **timer** shows how much class is left.
- **Live view:** who is on which page, who finished the core, soft "needs help" flags (see §6). No public rankings.
- **Lock screens** ("miren al frente"): every student screen shows a calm full-screen drawing (the character looking at the board) until the teacher unlocks. Also **send everyone to a page** for a group moment.
- **Wardrobe ritual:** the wardrobe opens automatically in the **last 5 minutes** (computed from the declared duration). Students may keep solving levels or dress their character. The teacher can open or close it by hand.
- **Class tree:** projected at the close, fed by everyone's seeds.
- **End class:** closes the session; unsolved essentials become each student's bridge for next class.

## 4. Suspended or shorter classes

The teacher decides; the platform suggests and never changes the plan silently.

- **Suspended class** (holiday, event, strike): nothing is lost for students. At the next session the platform notices the missed date (if the school calendar is loaded) or the teacher marks it, and proposes a re-plan: "quedan N clases y faltan M hojas: sugiero juntar la 8 con la 6, o saltear la 14". Each sheet carries a priority: *essential* (never skipped), *standard*, *recortable* (can be merged or skipped: e.g. 1ro's Zigzag, Guardas, the recess). The comodín sheet absorbs the first suspension.
- **Shorter class:** the teacher sets the real duration at the start and the class structure adapts.
  - Under ~25 minutes: do **not** introduce a new concept. Run a review or a recess activity and keep the new sheet for next class.
  - 25–45 minutes: the new sheet with its **essential pages only**; whoever does not finish gets the bridge next class.
  - Over 45 minutes: the normal class.
  - The timer and the wardrobe's last 5 minutes follow the declared duration.
- **Many absences:** the teacher chooses between going ahead (absent students get the bridge) or a recess activity.

## 5. Pacing adaptations

- **Student who needs help:** easy door by default and an "accompanied mode" with more scaffolding (ghost footprints, fewer blocks, shorter paths). Assigned by the teacher or suggested by the platform.
- **Slower course:** a sheet can span two classes; *recortable* sheets are merged or skipped so the year's essentials are still covered. The plan is recalculated and shown to the teacher.
- **First year of use / a course that did not do the previous years:** a per-division **starting point**. The first classes run **express sheets** (only the essentials of earlier concepts, two or three per class) before the grade's own year. Example: 3ro in its first year spends two classes on sequence, repeat and "si" before the rules. A short placement diagnostic (5–8 adaptive levels) recommends the starting point for the division and for each student; the teacher approves it. Students who already know the material go to the extras.
- **New student mid-year:** the same placement diagnostic places them and builds their personal bridge; the teacher can also place them by hand.

## 6. Assessment and help detection

- **Automatic report** per student per sheet and per term, built from: essentials solved, help used and at which level, strong and weak formats (fix, predict, complete), autonomy (asks for help vs. stays stuck). Output: a short paragraph ("Resuelve repeticiones con patrón de dos bloques sin ayuda; todavía necesita apoyo para contar vueltas") and a **suggested** grade the teacher confirms or changes. Never final on its own. The school's grading scale for 1ro is an open question (conceptual vs. numeric).
- **Help detection, not instant:** at class start, a "para acercarte hoy" list of 3–5 students with the reason (e.g. "cuenta pasos en vez de vueltas", "le quedaron imprescindibles después del puente", "usa mucho la solución en transparente"). During class, only a soft alert when someone is stuck on the same page for a long time. Reuse habilidades' failure-cause disambiguation: "didn't hear the instruction", "didn't understand the goal", "doesn't know how to drag" are tool problems, not concept problems, and are answered differently.

## 7. Motivation system

The goal is motivation that lasts a school year and several years, without the meta-game eating class time.

### Principles

1. **The activity comes first.** The strongest motivator for a 6–9 year old is "I can do this and I am getting better": challenges tuned to their level, immediate feedback, visible progress, no humiliating failure. Doors of three difficulties, gold stamps, diegetic errors and help without penalty all serve this.
2. **Choice (autonomy).** Few choices that matter: the door, the character and outfit, what to build in the workshop, the favorites for the showcase, the order in the comodín. Two or three options at a time for the youngest.
3. **Others (relatedness).** Classmates play your levels, the class tree is a shared goal, the showcase is for the family. Cooperation, never competition: rankings demotivate the bottom half of the class.
4. **The meta-game is informational, not controlling.** Rewards say "you mastered this" (a boss, a gold stamp, a finished sheet), not "do this to get that". Seeds are never spent, so there is no shop economy, no loss and no grinding. Rewards are known in advance (collection with a goal); small unannounced delights (the character reacts, a secret cell, a dance) add surprise without gambling.
5. **Everyone grows.** Any solved page grows the garden, including core pages done with help; the class tree counts everyone; the bridge is "tu camino", never "atrasado". Nobody's position is public.
6. **Different kids, different motivators.** Achievers go for gold and bosses, creators for workshops and outfits, socializers for the class tree and classmates' levels, explorers for extra doors and secrets. Offer all of them; the pilot measures which kids use what.

### Novelty cadence (so it never feels "always the same")

| Time scale | What changes |
|---|---|
| Within a class | Five practice formats, levels of 1–3 minutes, the boss as the climax, the wardrobe in the last 5 minutes |
| Every class | A new sheet with one new twist (a mechanic or an element such as water, ice, keys) and a spoken cliffhanger at the end |
| Every 3–4 classes | A change of rhythm: a minigame, a recess sheet or a workshop where they create |
| Every zone (twice a year) | New scenery, critters, outfits and music (1ro: forest, then river after the winter break) |
| Every year | A new region of the world, a new power of the character (the year's concept), a more grown-up editor and look, a new way to create |
| Across years | The same character and its wardrobe travel with the student; the garden of 1ro becomes the entrance to 2do's world; last year's poster hangs in their corner; older students make levels for younger ones (3ro builds for 1ro) |
| Special days | Seasonal events tied to the school calendar (e.g. spring day in September), and the showcase at year end |

### Wardrobe and accessories

- Opens in the last 5 minutes (teacher-controlled; see §3). Outfits are chosen, never drawn.
- Needs many more pieces: about 4–6 per zone (12–15 per year), a few seasonal ones, some tied to specific achievements (e.g. something musical for the music recess, a pen for the guardas), and color variants chosen from a small palette (customization without drawing).
- Pieces unlock at seed milestones and finished sheets, known in advance; seeds are not spent.

### Minigames

- Every few classes or after a boss, a short minigame (5–10 minutes) breaks the routine. Optional, used in recess sheets or when a student finishes early.
- Each one builds a skill:
  - **Typing** ("Teclas del bosque"): falling seeds or leaves carry letters; pressing the key catches them. 1ro: letters of their name and vowels (it also supports literacy); 2do: short words, their username; 3ro: short commands ("si", "repetir"). Adaptive speed; the key is highlighted on a drawn keyboard. Useful for 2do's autonomy and for Scratch and Python later.
  - **Sequence memory**: "Simón" on the xylophone.
  - **Patterns**: continue the pattern (colors, sounds, shapes).
  - **Spatial puzzles**: tangram-like pieces.
  - **Precision** for sala 4 and 5: tap and drag targets.
- No punishing timers: speed adapts, and there is no losing.

### What to avoid

Public rankings, punishing countdowns, attendance streaks (being absent is not the student's choice), random reward packs, spending progress, rewards for time or clicks, notifications outside school, and any meta-game moment that runs longer than its slot.

## 8. Showcase (muestra) and its rehearsal

- The current sheet 17 (favorites, family mode, garden tour, poster) is a good base but needs work.
- Add a **rehearsal mode** for class 16: students pick favorites and practice guiding a partner who plays "the family"; rehearsals do not stamp sheet 17.
- Showcase day: stations for families, a short guide card for parents, the class tree projected, the poster printable.

## 9. Open questions

- The school's grading scale for 1ro (conceptual "Muy bien / Bien / Regular" or numeric).
- Sala de 4 and 5: how often and how long.
- Devices per grade (tablets, PCs, touch Chromebooks) and classroom internet reliability.
- School and family consent policy for collecting data.
- Whether 4to replaces Scratch with Camino's own game maker; decide after the pilot's 4to/5to probes.
