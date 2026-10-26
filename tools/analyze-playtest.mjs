#!/usr/bin/env node
// T34: reads an export (the JSON `tools/export-playtest.mjs` writes, same
// as `GET /api/export?format=json`) and prints the per-class report by hand
// on 2026-10-15, so each new class is read the same way. No dependencies:
// plain Node, and the actual computations live in `../src/playtest/report.ts`
// (a pure module, unit-tested in report.test.ts) — Node 24 strips that
// file's types at load time, no build step needed.
//
// Usage: node tools/analyze-playtest.mjs <export.json> [--since YYYY-MM-DD] [--until YYYY-MM-DD]

import { readFileSync, writeFileSync } from 'node:fs';
import {
  analyze, childLabel, CONCEPT_FAMILIES, COPA2_UNDERSTANDING_RULE, COPA_UNDERSTANDING_RULE, localTime, UNDERSTANDING_RULE,
} from '../src/playtest/report.ts';
// T49: the 1ro arcade section (its own module, so 1ro's and 4to's report work never touch the same lines)
import { MONSTER_GAME_NAME, MONSTER_GAMES, monsterReport } from '../src/playtest/reportMonster.ts';

function parseArgs(argv) {
  const [file, ...rest] = argv;
  if (!file) {
    console.error('usage: node tools/analyze-playtest.mjs <export.json> [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--csv <file>]');
    process.exit(2);
  }
  const opts = {};
  let csv;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--since') opts.since = rest[++i];
    else if (rest[i] === '--until') opts.until = rest[++i];
    else if (rest[i] === '--csv') csv = rest[++i];
  }
  return { file, opts, csv };
}

function fmtMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${s % 60} s`;
}

function fmtPct(p) {
  return p == null ? '—' : `${p.toFixed(1)}%`;
}

function fmtDist(dist) {
  const entries = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries.map(([k, v]) => `${k}: ${v}`).join(', ') : '(sin datos)';
}

function line(s = '') {
  console.log(s);
}

function section(title) {
  line('');
  line(`== ${title} ==`);
}

function reportDropped(dropped, totalSessions) {
  section('Filtro de ruido');
  line(`Sesiones totales en el export: ${totalSessions}.`);
  if (dropped.length === 0) {
    line('Ninguna sesión se descartó.');
    return;
  }
  const byReason = {};
  for (const d of dropped) (byReason[d.reason] ??= []).push(childLabel(d.session));
  const labels = {
    demo: 'sesiones de demo',
    short: 'sesiones muy cortas (≤10 eventos o <60 s)',
    projector: 'la sesión del proyector (comentario del adulto)',
    outside_window: 'fuera de la ventana de fechas pedida',
  };
  for (const [reason, codes] of Object.entries(byReason)) {
    line(`- ${labels[reason] ?? reason}: ${codes.length} (${codes.join(', ')})`);
  }
  line(`Total descartado: ${dropped.length}.`);
}

function reportClasses(classes) {
  section('Clases (agrupadas por inicio, hueco > 20 min)');
  if (classes.length === 0) { line('No hay sesiones para agrupar en clases.'); return; }
  classes.forEach((c, i) => {
    const grades = c.grades.map((g) => `${g}°`).join(', ');
    line(`Clase ${i + 1}: ${c.sessions.length} sesión(es), grado(s) ${grades}, ${localTime(c.startedAt)}–${localTime(c.endedAt)}.`);
    line(`  Cómo terminaron: ${fmtDist(c.endReasons)}`);
  });
}

function reportLadder(r) {
  section('Escalera');
  line(`Sesiones que llegaron al final de la escalera: ${r.sessionsReached}.`);
  line(`Distribución del techo (rung más alto pasado, "null" = ninguno): ${fmtDist(r.ceilingDist)}`);
  line(`Por qué terminó: ${fmtDist(r.endReasons)}`);
  line(`Tiempo mediano: ${fmtMs(r.medianTimeMs)}. Ítems medianos: ${r.medianItems ?? '—'}.`);
}

function reportFreePlay(r) {
  section('Juego libre');
  line(`Actividades elegidas: ${fmtDist(r.activityCounts)}`);
  line(`Actividades distintas por chico (mediana): ${r.medianDistinctActivitiesPerChild ?? '—'}`);
  line('Tiempo mediano por actividad:');
  for (const [a, ms] of Object.entries(r.medianTimePerActivityMs)) line(`  - ${a}: ${fmtMs(ms)}`);
  line(`Llegaron a la bandera verde (route_done): ${r.sessionsReachedGreenFlag}.`);
  line(`Tiempo mediano de juego libre después de la bandera: ${fmtMs(r.medianFreePlayMsAfterGreenFlag)}`);
}

function reportRepeat(r) {
  section('El repeat: bloque después en vez de adentro');
  line(`Sesiones con al menos un intento así: ${r.sessionsWithDrop}.`);
  line(`Intentos totales: ${r.attempts}.`);
  line(`Intentos medianos por ítem — con repeat: ${r.medianAttemptsRepeatConcepts ?? '—'}, sin (sequence/long_sequence): ${r.medianAttemptsSequenceConcepts ?? '—'}.`);
}

function reportPredict(r) {
  section('Predecir (▶ sin elegir, y qué pasa después de errar)');
  line(`Presiones de ▶ sin elegir celda: ${r.noGuessPresses} (en ${r.noGuessSessions} sesión(es)).`);
  line(`Después de errar, el siguiente intento fue: ganó ${r.wrongThenRight} vez(ces), volvió a errar ${r.wrongThenWrong} vez(ces).`);
}

function reportTyping(r) {
  section('Teclas del bosque');
  line(`Teclas físicas: ${r.physicalKeys} (acierto ${fmtPct(r.physicalAccuracyPct)}). Teclas táctiles: ${r.touchKeys} (acierto ${fmtPct(r.touchAccuracyPct)}).`);
  line(`Porción táctil del total: ${fmtPct(r.touchSharePct)}.`);
  line(`Rondas completadas: ${fmtDist(r.roundsCompletedDist)} (mediana ${r.medianRoundsCompleted ?? '—'}).`);
}

function reportHelp(r) {
  section('Ayuda');
  line(`✋ tocado: ${r.helpTouches} vez(ces), en ${r.helpSessions} sesión(es).`);
  line(`Mano levantada (call_adult): ${r.callAdultCount} vez(ces), en ${r.callAdultSessions} sesión(es).`);
  line(`El adulto contó cómo ayudó (adult_help): ${r.adultHelpCount} vez(ces), en ${r.adultHelpSessions} sesión(es).`);
}

function reportAttention(r) {
  section('Jardín, recargas, visibilidad, inactividad');
  line(`Vieron el jardín (garden_view): ${r.gardenViewSessions} sesión(es).`);
  line(`Recargas que siguieron la sesión (resume): ${r.resumeCount} vez(ces), en ${r.resumeSessions} sesión(es).`);
  line(`La pestaña se ocultó (visibility hidden): ${r.visibilityHiddenCount} vez(ces).`);
  line(`Tramos de inactividad (idle): ${r.idleCount}, mediana ${fmtMs(r.medianIdleMs)}.`);
}

function reportClassCommands(r) {
  section('Comandos de clase (tardanza > 2 min)');
  const kinds = Object.entries(r.byKind);
  if (kinds.length === 0) { line('No se enviaron comandos de clase.'); return; }
  for (const [kind, b] of kinds) line(`- ${kind}: ${b.devices} dispositivo(s), ${b.lateDevices} tarde(s).`);
}

function reportSurvey(r) {
  section('Encuesta');
  const qs = Object.entries(r.byQuestion);
  if (qs.length === 0) { line('Sin respuestas de encuesta.'); return; }
  for (const [q, answers] of qs) line(`- ${q}: ${fmtDist(answers)}`);
}

function reportRace(r) {
  section('La carrera (T33)');
  if (r.sessionsWithRace === 0) {
    line('Sin datos de carrera en este export (probablemente de antes de T33).');
    return;
  }
  line(`Sesiones que corrieron: ${r.sessionsWithRace}. Carreras totales: ${r.racesStarted} (mediana por chico: ${r.medianRacesPerChild ?? '—'}).`);
  line(`"¡Otra carrera!" voluntaria: ${r.voluntaryAgainRaces} vez(ces).`);
  line('Turbo (repetir) ofrecido/usado por nivel:');
  for (const [tier, b] of Object.entries(r.turboByTier)) line(`  - nivel ${tier}: ofrecido ${b.offered}, usado ${b.used}.`);
  line('Tiempo mediano por tramo, por nivel:');
  for (const [tier, ms] of Object.entries(r.medianStretchMsByTier)) line(`  - nivel ${tier}: ${fmtMs(ms)}.`);
  line(`Bloques incorrectos por tramo (mediana): ${r.wrongBlocksPerStretchMedian ?? '—'}.`);
  line(`De dónde vinieron los bloques: tap ${r.inputSources.tap}, drag ${r.inputSources.drag}, teclado ${r.inputSources.key}.`);
}

const COPA_CIRCUIT_LABEL = { 1: 'secuencia', 2: 'repetir (turbo)', 3: 'si hay charco / si no', 4: 'al aparecer el tronco → saltar', 5: 'variable vueltas' };

function copaCircuitCell(c) {
  if (!c.reached) return 'no llegó';
  const place = (p) => (p == null ? '—' : `${p}°`);
  return `mejor ${place(c.bestPlace)} (1er intento ${place(c.firstPlace)}), margen ${fmtMs(c.marginMs)}, motivo(s): ${c.reasons.join(', ') || '—'}, revanchas ${c.revanchas}, concepto bien al 1er intento: ${c.conceptOkFirstTry ? 'sí' : 'no'}, ayuda máxima ${c.helpLevelMax}.`;
}

function reportCopaChild(copa) {
  line('      Copa de 4to:');
  for (const id of [1, 2, 3, 4, 5]) line(`        circuito ${id} (${COPA_CIRCUIT_LABEL[id]}): ${copaCircuitCell(copa.circuits[id])}`);
}

function reportCopa(r) {
  section('Copa de 4to (C05)');
  if (r.children.length === 0) {
    line('Sin datos de la Copa en este export (de antes de C04, o nadie de 4to llegó).');
    return;
  }
  line('Cuántos llegaron a cada circuito, y cuántos tuvieron el concepto bien al primer intento:');
  for (const id of [1, 2, 3, 4, 5]) {
    line(`  - circuito ${id} (${COPA_CIRCUIT_LABEL[id]}): llegaron ${r.reachedByCircuit[id]}, concepto bien al 1er intento ${fmtPctOrDash(r.conceptOkFirstTryShareByCircuit[id])}.`);
  }
  line(`Revanchas voluntarias en la Copa: ${r.revanchasTotal}. "¡Otra carrera!" voluntaria en la Carrera de teclas honesta: ${r.typingAgainHonestTotal}.`);
  line(`Cómo se abrió el Arcade: circuito 2 → ${r.arcadeUnlockVia.circuit_2}, temporizador de 20 min → ${r.arcadeUnlockVia.timer}, "Juegos para todos" → ${r.arcadeUnlockVia.admin}, otro → ${r.arcadeUnlockVia.other}.`);
  line(`Siguieron jugando la Copa después de que se abrió el Arcade (señal de interés voluntario): ${r.keptPlayingAfterArcade} de ${r.children.length}.`);
  line(`Carrera de teclas honesta — lugares reales de los chicos: ${fmtDist(r.typingPlaceDistHonest)}.`);
  line('Por chico:');
  for (const c of r.children) {
    line(`  - ${c.code}: llegó a ${c.circuitsReached}/5 circuitos, revanchas ${c.revanchasTotal}, señal de esta sección: ${UNDERSTANDING_LABEL[c.understanding]}.`);
  }
}

// ---- C10: Copa v2 (the garage: one program that grows across five copas)

const COPA2_LABEL = { 1: 'secuencia', 2: 'repetir', 3: 'si / si no', 4: 'eventos (tronco)', 5: 'variables (vueltas)' };
const yn = (b) => (b == null ? '—' : b ? 'sí' : 'no');

function copa2ConceptCell(k) {
  if (!k.reached) return k.deer.seen ? `no corrió su pista; ciervo ${k.deer.fixed ? 'arreglado' : 'no arreglado'}` : 'no llegó';
  const o = k.own;
  const parts = [
    `pista ${o.track}: ${o.solved ? 'resuelta' : 'sin resolver'} en ${o.runs} corrida(s), ${o.crashesBeforeSuccess} choque(s)/corte(s) antes del éxito`,
    `mano fantasma ${yn(o.ghostUsed)}`,
    `mejor lugar ${o.bestPlace ?? '—'}`,
    `revanchas ${o.revanchas}`,
  ];
  if (k.deer.seen) parts.push(`ciervo ${k.deer.fixed ? 'arreglado' : 'sin arreglar'} (${k.deer.attempts} intento(s), ${fmtMs(k.deer.ms)})`);
  if (k.spies) parts.push(`Espiá ${k.spiesCorrect}/${k.spies} bien`);
  if (k.skipped) parts.push('saltó a la copa siguiente');
  return `${parts.join('; ')}.`;
}

function reportCopa2Child(c) {
  line(`      Copa v2: empezó en la copa ${c.startCopa ?? '—'} (techo de la escalera ${c.ceilingRung ?? '—'}), llegó hasta la copa ${c.furthestCopa ?? '—'}.`);
  for (const id of [1, 2, 3, 4, 5]) line(`        copa ${id} (${COPA2_LABEL[id]}): ${copa2ConceptCell(c.concepts[id])}`);
  line(`        lee (Espiá bien): ${yn(c.reads)} · depura (ciervo arreglado): ${yn(c.debugs)} · crea (pista propia sin mano fantasma): ${yn(c.creates)} (${c.conceptsCreated}/${c.conceptsReached}).`);
}

function reportCopa2(r) {
  section('Copa v2 (C10): el garaje');
  if (r.children.length === 0) {
    line('Sin datos de la Copa v2 en este export (de antes de C10, o nadie de 4to llegó).');
    return;
  }
  line(`Chicos con datos de la Copa v2: ${r.children.length}.`);
  line(`Dónde empezaron (copa de partida según la escalera): ${fmtDist(r.startDist)}. Hasta dónde llegaron: ${fmtDist(r.furthestDist)}.`);
  line('Por copa: cuántos corrieron su pista, cuántos la resolvieron, y qué % la resolvió sin la mano fantasma (el concepto lo armó el chico):');
  for (const id of [1, 2, 3, 4, 5]) {
    line(`  - copa ${id} (${COPA2_LABEL[id]}): llegaron ${r.reachedByCopa[id]}, la resolvieron ${fmtPctOrDash(r.solvedShareByCopa[id])}, sin mano fantasma ${fmtPctOrDash(r.createdShareByCopa[id])}.`);
  }
  line(`Por qué no terminaron las corridas (choques por causa, programa que se corta o que no termina): ${fmtDist(r.crashCauses)}.`);
  line(`Revanchas voluntarias: ${r.revanchasTotal}. Usaron "¡Saltar a la copa siguiente!": ${r.skipChildren} chico(s), ${r.skipTotal} vez(ces). La mano fantasma se encendió en ${r.ghostChildren} chico(s).`);
  line(`Ayudá al ciervo: visto ${r.deerSeenTotal} vez(ces), arreglado ${fmtPctOrDash(r.deerFixedShare)}. Espiá el programa del zorro: ${r.spyTotal} vez(ces), truco bien ${fmtPctOrDash(r.spyCorrectShare)}.`);
  line(`Cómo se abrió el Arcade: copa 2 terminada → ${r.arcadeUnlockVia.copa_2}, temporizador de 20 min → ${r.arcadeUnlockVia.timer}, "Juegos para todos" → ${r.arcadeUnlockVia.admin}, otro → ${r.arcadeUnlockVia.other}.`);
  line(`Siguieron corriendo pistas de la Copa después de que se abrió el Arcade (interés voluntario): ${r.keptPlayingAfterArcade} de ${r.children.length}.`);
  line(`Carrera de teclas honesta entre estos chicos: "¡Otra carrera!" ${r.typingAgainHonestTotal}; lugares: ${fmtDist(r.typingPlaceDistHonest)}.`);
  line('Por chico:');
  for (const c of r.children) {
    line(`  - ${c.code}: empezó en la copa ${c.startCopa ?? '—'}, llegó a la ${c.furthestCopa ?? '—'}; pistas propias sin mano fantasma ${c.conceptsCreated}/${c.conceptsReached}; lee ${yn(c.reads)}, depura ${yn(c.debugs)}, crea ${yn(c.creates)}; señal: ${UNDERSTANDING_LABEL[c.understanding]}.`);
  }
}

function reportArcade(r) {
  section('El Arcade de 4to: Carrera de teclas y Tu juego (T41)');
  if (r.children.length === 0) {
    line('Sin datos del Arcade en este export (de antes de T41, o nadie de 4to llegó).');
    return;
  }
  line(`Carrera de teclas: ${r.sessionsWithTypingRace} chico(s), ${r.typingRaces} carrera(s), "¡Otra carrera!" voluntaria ${r.typingAgain} vez(ces).`);
  line(`Palabras por minuto (mediana de las carreras terminadas): ${r.medianWpm ?? '—'}. Teclas justas (mediana por chico): ${fmtPct(r.medianAccuracy)}. Duración mediana de una carrera terminada: ${fmtMs(r.medianRaceMs)} (meta: 60–90 s).`);
  line(`Tu juego: ${r.sessionsWithOwnGame} chico(s), ${r.ownGameRuns} partida(s).`);
  line('Por chico:');
  for (const c of r.children) {
    const typing = c.typingRaces
      ? `teclas: ${c.typingRaces} carrera(s) (otra ${c.typingAgain}, terminadas ${c.typingFinished}), ppm mejor ${c.bestWpm ?? '—'} / mediana ${c.medianWpm ?? '—'}, teclas justas ${fmtPct(c.accuracy)}`
      : 'teclas: —';
    const own = c.ownGameRuns ? `tu juego: ${c.ownGameRuns} partida(s), récord ${c.ownGameBest ?? '—'}` : 'tu juego: —';
    line(`  - ${c.code}: ${typing}; ${own}`);
  }
}

const SKILL_LINE = {
  recipe: (k) => `bien al primer intento ${fmtPct(k.firstTryPct)} de las rondas; errores de orden por ronda (mediana) ${k.medianOrderErrors ?? '—'}; hasta el primer toque (mediana) ${fmtMs(k.medianFirstInputMs)}`,
  dance: (k) => `el baile más largo copiado (mediana por chico): ${k.medianLongest ?? '—'} pasos`,
  oops: (k) => `encontró el error al primer toque ${fmtPct(k.foundFirstPct)}; el primer arreglo fue el justo ${fmtPct(k.fixFirstPct)}; hasta el primer toque (mediana) ${fmtMs(k.medianFirstInputMs)}`,
  tap: (k) => `reglas hechas por chico (mediana) ${k.medianRulesMade ?? '—'}; tiempo jugando con lo que armó (mediana) ${fmtMs(k.medianPlayMs)}; toques jugando (mediana) ${k.medianPlayTaps ?? '—'}; efectos elegidos: ${fmtDist(k.effectsChosen ?? {})}`,
};

function reportMonster(r) {
  section('Los juegos del monstruo (1ro, T43–T47)');
  if (r.sessions === 0) {
    line('Sin datos de los juegos del monstruo en este export (de antes del 2026-10-25, o ningún chico de 1ro los jugó).');
    return;
  }
  line(`Chicos de 1ro que jugaron: ${r.sessions}. Pasada guiada completa (los ${MONSTER_GAMES.length} juegos terminados): ${r.guidedAll}. Salieron de la pasada guiada (bandera verde): ${r.guidedDone}.`);
  line('"Repetir voluntario" = elegirlo otra vez en el Arcade (ya jugado) o "¡Otra vez!".');
  for (const g of r.games) {
    line(`- ${MONSTER_GAME_NAME[g.game]} (${g.game}): ${g.children} chico(s), ${g.plays} partida(s) (${g.arcadePicks} elegidas en el Arcade), ${g.rounds} ronda(s) ganada(s), repetir voluntario ${g.voluntaryReplays}, terminadas ${g.finished} / abandonadas ${g.quit}, mareos (toques muy rápidos) ${g.rapidTaps}.`);
    line(`    ${SKILL_LINE[g.game](g.skill)}.`);
    line(`    Encuesta "¿Te gustó?": ${fmtDist(g.liked)}`);
  }
  line(`Favorito (más repeticiones voluntarias; un empate cuenta para cada uno): ${fmtDist(r.favourites)}`);
  // T51: how they left a game of the arcade (game_exit.via)
  const VIA = { end_button: '"Otro juego" al terminar', play_button: 'botón grande jugando', bar_menu: 'botón chico de la barra' };
  const viaDist = (d) => Object.keys(d).length ? Object.entries(d).map(([k, v]) => `${VIA[k] ?? k} ${v}`).join(', ') : '—';
  line(`Salidas de un juego al menú (T51): ${viaDist(r.exits)}.`);
  for (const [g, d] of Object.entries(r.exitsByGame)) line(`    ${g}: ${viaDist(d)}`);
  line('Por chico:');
  for (const c of r.children) {
    const per = MONSTER_GAMES.map((g) => `${g} ${c.plays[g] ?? 0}${c.voluntary[g] ? ` (+${c.voluntary[g]} vol.)` : ''}`).join(', ');
    line(`  - ${c.code}: ${per}; favorito ${c.favourite.length ? c.favourite.join('/') : '—'}; pasada guiada ${c.guidedFinished.length}/${MONSTER_GAMES.length}${c.guidedDone ? ' (bandera verde)' : ''}.`);
  }
}

const UNDERSTANDING_LABEL = {
  entiende: 'entiende',
  a_medias: 'a medias',
  copia_o_no_llego: 'copia o no llegó',
};

const SOURCE_LABEL = { workshop: 'Taller', copa2: 'Copa v2', copa: 'Copa (circuitos)', none: 'sin datos' };

function conceptCell(r) {
  if (r.status === 'not_reached') return 'no llegó';
  if (r.status === 'failed') return `falló (escalón ${r.rung})`;
  return `pasó (escalón ${r.rung}, ${r.via === 'variant' ? '2do intento' : '1er intento'})`;
}

function fmtPctOrDash(p) {
  return p == null ? '—' : fmtPct(p);
}

function reportGradeChild(c) {
  line(`  - ${c.code} (${c.grade}°):`);
  line(`      Escalera: techo ${c.ladderCeiling ?? '—'}.`);
  for (const fam of CONCEPT_FAMILIES) line(`      ${fam.label}: ${conceptCell(c.concepts[fam.key])}`);
  const w = c.workshop;
  if (w.reached) {
    line(`      Taller: ${w.coreSolved}/${w.coreTotal} desafíos core + ${w.freeSolved} libres. Predecir ${w.predictCorrect == null ? '—' : (w.predictCorrect ? 'bien' : 'mal')}, investigar ${w.investigateCorrect == null ? '—' : (w.investigateCorrect ? 'bien' : 'mal')}. Resueltos sin ayuda: ${w.solvedWithoutHelp}.`);
  } else {
    line('      Taller: no llegó.');
  }
  if (c.copa2) reportCopa2Child(c.copa2);
  else if (c.copa) reportCopaChild(c.copa);
  else line('      Copa de 4to: no llegó.');
  line(`      Señal de comprensión (${SOURCE_LABEL[c.understandingSource]}): ${UNDERSTANDING_LABEL[c.understanding]}.`);
  if (c.arcade) {
    line(`      Carrera de teclas: mejor ${c.arcade.bestWpm ?? '—'} ppm, teclas justas ${fmtPctOrDash(c.arcade.accuracy)}.`);
  } else {
    line('      Carrera de teclas: —.');
  }
  const t = c.time;
  const onTaskMin = Math.round(t.onTaskMs / 60_000);
  const hiddenPctVal = fmtPctOrDash(t.totalMs > 0 ? (t.hiddenMs / t.totalMs) * 100 : null);
  line(`      Tiempo: ${onTaskMin} min en tarea de ${Math.round(t.totalMs / 60_000)} min totales; pestaña oculta ${hiddenPctVal}; inactividad ${fmtMs(t.idleMs)}.`);
  line(`      Ayuda: ✋ ${t.helpTouches} vez(ces), mano levantada ${t.callAdultCount} vez(ces).`);
}

function reportGrades(g) {
  if (g.grade4.length === 0 && g.grade5.length === 0) return;
  section('Evaluación de 4to (y 5to) para el año que viene (T42)');
  line(`Regla del Taller — "entiende / a medias / copia o no llegó" (UNDERSTANDING_RULE en report.ts): "entiende" necesita predecir e investigar bien Y ≥${UNDERSTANDING_RULE.MIN_SOLVED_WITHOUT_HELP_FOR_ENTIENDE} desafíos core resueltos sin ayuda; "copia o no llegó" si predecir o investigar salió mal, o si resolvió ≤${UNDERSTANDING_RULE.MAX_CORE_SOLVED_FOR_COPIA} desafíos core (de ${UNDERSTANDING_RULE.CORE_CHALLENGES}); el resto queda "a medias". Para un chico que nunca llegó al Taller pero sí a la Copa (C05, la ruta de 4to desde C04), la señal viene de la Copa en cambio (COPA_UNDERSTANDING_RULE): "entiende" con el concepto bien al primer intento en ≥${COPA_UNDERSTANDING_RULE.MIN_FIRST_TRY_OK_FOR_ENTIENDE} de los 5 circuitos y sin necesitar nunca el nivel de ayuda 2 (la ranura resaltada); "copia o no llegó" con ≤${COPA_UNDERSTANDING_RULE.MAX_FIRST_TRY_OK_FOR_COPIA} circuito(s) bien al primer intento, o con menos de ${COPA_UNDERSTANDING_RULE.MIN_CIRCUITS_REACHED} circuitos alcanzados; el resto, "a medias". Para la Copa v2 (C10, el garaje: un programa que crece), la señal viene de tres cosas: "crea" (resolvió su pista propia de cada copa SIN que la mano fantasma mostrara el próximo bloque), "depura" (arregló el programa del ciervo) y "lee" (tocó el bloque del truco en Espiá): "entiende" con al menos ${COPA2_UNDERSTANDING_RULE.MIN_CONCEPTS_REACHED} conceptos alcanzados, ≥${Math.round(COPA2_UNDERSTANDING_RULE.MIN_CREATED_SHARE * 100)}% de las pistas propias armadas sin mano fantasma y ni "lee" ni "depura" fallando (al menos ${COPA2_UNDERSTANDING_RULE.MIN_READ_DEBUG_SHARE * 100}% bien, si hubo algo que leer o arreglar); "copia o no llegó" con menos de ${COPA2_UNDERSTANDING_RULE.MIN_CONCEPTS_REACHED} conceptos alcanzados o a lo sumo ${COPA2_UNDERSTANDING_RULE.MAX_CREATED_FOR_COPIA} pista(s) propia(s) sin mano fantasma; el resto, "a medias". Cada chico de esta tabla indica cuál de las fuentes usó ("Señal de comprensión").`);
  if (g.grade4.length) {
    line('');
    line(`4to (${g.grade4.length} chico(s)):`);
    for (const c of g.grade4) reportGradeChild(c);
  }
  if (g.grade5.length) {
    line('');
    line(`5to (${g.grade5.length} chico(s)):`);
    for (const c of g.grade5) reportGradeChild(c);
  }
  const s = g.summary4to;
  if (s) {
    line('');
    line('Resumen de la clase de 4to (lo que entra a 5to el año que viene):');
    line(`  Chicos: ${s.childCount}. Techo mediano: ${s.medianCeiling ?? '—'}. Techo más común (moda): ${s.modeCeiling ?? '—'}.`);
    const famLabel = (key) => CONCEPT_FAMILIES.find((f) => f.key === key)?.label ?? key;
    line(`  Concepto que más chicos tienen: ${s.mostCommonConcept ? famLabel(s.mostCommonConcept) : '—'}.`);
    line(`  Conceptos más débiles (de más a menos): ${s.weakestConcepts.length ? s.weakestConcepts.map(famLabel).join(', ') : '—'}.`);
    if (s.belowEntry.length) {
      line(`  Claramente por debajo del techo esperado (${s.belowEntry.length}):`);
      for (const b of s.belowEntry) line(`    - ${b.code}: ${b.reason}`);
    } else {
      line('  Nadie claramente por debajo del techo esperado.');
    }
    line(`  Minutos medianos en tarea: ${s.medianOnTaskMinutes == null ? '—' : s.medianOnTaskMinutes.toFixed(1)}. Pestaña oculta (mediana): ${fmtPctOrDash(s.medianHiddenPct)}.`);
    line(`  Siguieron en el Taller después de que se abrió el Arcade (voluntario): ${s.voluntaryWorkshopContinuation} de ${s.childCount}.`);
    line(`  Carreras de teclas por chico (mediana): ${s.medianTypingRaces ?? '—'}.`);
  }
}

const yn2 = (b) => (b == null ? '' : b ? 'si' : 'no');

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeGradeCsv(path, g) {
  const children = [...g.grade4, ...g.grade5];
  if (children.length === 0) {
    line(`(--csv ${path}: no hay chicos de 4to/5to en este export, no se escribió el archivo)`);
    return;
  }
  const famKeys = CONCEPT_FAMILIES.map((f) => f.key);
  const header = [
    'nombre', 'grado', 'techo_escalera',
    ...famKeys,
    'taller_llego', 'taller_core_resueltos', 'taller_core_total', 'taller_libres_resueltos',
    'taller_predecir_bien', 'taller_investigar_bien', 'taller_resueltos_sin_ayuda',
    'copa_llego', 'copa_circuitos_llegados', 'copa_revanchas',
    'garage_llego', 'garage_copa_inicial', 'garage_copa_mas_lejos', 'garage_pistas_sin_mano', 'garage_pistas_llegadas',
    'garage_lee', 'garage_depura', 'garage_crea', 'garage_revanchas', 'garage_saltos',
    'senal_comprension', 'fuente_senal',
    'carrera_teclas_mejor_ppm', 'carrera_teclas_justas_pct',
    'minutos_totales', 'minutos_en_tarea', 'pestana_oculta_pct', 'inactividad_ms',
    'ayuda_mano_vezes', 'ayuda_adulto_vezes',
  ];
  const rows = children.map((c) => {
    const w = c.workshop;
    const copa = c.copa;
    const famCells = famKeys.map((k) => conceptCell(c.concepts[k]));
    const hiddenPctVal = c.time.totalMs > 0 ? (c.time.hiddenMs / c.time.totalMs) * 100 : '';
    return [
      c.code, c.grade, c.ladderCeiling ?? '',
      ...famCells,
      w.reached ? 'si' : 'no', w.coreSolved, w.coreTotal, w.freeSolved,
      w.predictCorrect == null ? '' : (w.predictCorrect ? 'si' : 'no'),
      w.investigateCorrect == null ? '' : (w.investigateCorrect ? 'si' : 'no'),
      w.solvedWithoutHelp,
      copa ? 'si' : 'no', copa?.circuitsReached ?? 0, copa?.revanchasTotal ?? 0,
      c.copa2 ? 'si' : 'no', c.copa2?.startCopa ?? '', c.copa2?.furthestCopa ?? '', c.copa2?.conceptsCreated ?? '', c.copa2?.conceptsReached ?? '',
      yn2(c.copa2?.reads), yn2(c.copa2?.debugs), yn2(c.copa2?.creates), c.copa2?.revanchas ?? '', c.copa2?.skips ?? '',
      UNDERSTANDING_LABEL[c.understanding], SOURCE_LABEL[c.understandingSource],
      c.arcade?.bestWpm ?? '', c.arcade?.accuracy ?? '',
      Math.round(c.time.totalMs / 60_000), Math.round(c.time.onTaskMs / 60_000),
      hiddenPctVal === '' ? '' : hiddenPctVal.toFixed(1), Math.round(c.time.idleMs),
      c.time.helpTouches, c.time.callAdultCount,
    ];
  });
  const text = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n') + '\n';
  writeFileSync(path, text, 'utf8');
  line(`Tabla por chico escrita en ${path} (${rows.length} fila(s)).`);
}

function reportProfiles(r) {
  section('Perfiles de motivación (T37, una heurística para aprender — no un diagnóstico)');
  if (!r.hasRaceData) {
    line('Este export no tiene datos de la carrera (de antes de T33): "racer" y "collector" casi no tienen señal voluntaria para apoyarse, así que los perfiles de esta clase son débiles.');
  }
  line(`Distribución general: ${fmtDist(r.distribution)}`);
  line('Por grado:');
  for (const [grade, dist] of Object.entries(r.byGrade)) line(`  - ${grade}°: ${fmtDist(dist)}`);
  line(`Mediana de tiempo en el vestidor (paso obligatorio; solo referencia para la señal débil de "dresser"): ${fmtMs(r.classMedianWardrobeMs)}`);
  line('Evidencia por chico (código de sesión anónimo):');
  for (const c of r.children) line(`  - ${c.code}: ${c.profile} (${c.evidence})`);
}

async function main() {
  const { file, opts, csv } = parseArgs(process.argv.slice(2));
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const a = analyze(data, opts);

  line(`Informe de la prueba piloto — ${file}${opts.since || opts.until ? ` (${opts.since ?? '…'} a ${opts.until ?? '…'})` : ''}`);
  line(`Sesiones consideradas (después del filtro de ruido): ${a.kept.length} de ${a.totalSessions}.`);
  reportDropped(a.dropped, a.totalSessions);
  reportClasses(a.classes);
  reportLadder(a.ladder);
  reportFreePlay(a.freePlay);
  reportRepeat(a.repeatDrop);
  reportPredict(a.predict);
  reportTyping(a.typing);
  reportHelp(a.help);
  reportAttention(a.attention);
  reportClassCommands(a.classCommands);
  reportSurvey(a.survey);
  reportRace(a.race);
  reportArcade(a.arcade);
  reportCopa(a.copa);
  reportCopa2(a.copa2);
  {
    const keptIds = new Set(a.kept.map((s) => s.id));
    reportMonster(monsterReport(a.kept, data.events.filter((e) => keptIds.has(e.session_id))));
  }
  reportProfiles(a.profiles);
  reportGrades(a.grades);
  if (csv) writeGradeCsv(csv, a.grades);
  line('');
}

main().catch((err) => {
  console.error(`analyze-playtest failed: ${err.message}`);
  process.exit(1);
});
