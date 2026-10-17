#!/usr/bin/env node
// T34: reads an export (the JSON `tools/export-playtest.mjs` writes, same
// as `GET /api/export?format=json`) and prints the per-class report by hand
// on 2026-10-15, so each new class is read the same way. No dependencies:
// plain Node, and the actual computations live in `../src/playtest/report.ts`
// (a pure module, unit-tested in report.test.ts) — Node 24 strips that
// file's types at load time, no build step needed.
//
// Usage: node tools/analyze-playtest.mjs <export.json> [--since YYYY-MM-DD] [--until YYYY-MM-DD]

import { readFileSync } from 'node:fs';
import {
  analyze, localTime,
} from '../src/playtest/report.ts';

function parseArgs(argv) {
  const [file, ...rest] = argv;
  if (!file) {
    console.error('usage: node tools/analyze-playtest.mjs <export.json> [--since YYYY-MM-DD] [--until YYYY-MM-DD]');
    process.exit(2);
  }
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--since') opts.since = rest[++i];
    else if (rest[i] === '--until') opts.until = rest[++i];
  }
  return { file, opts };
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
  for (const d of dropped) (byReason[d.reason] ??= []).push(d.session.code ?? d.session.id);
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
  const { file, opts } = parseArgs(process.argv.slice(2));
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
  reportProfiles(a.profiles);
  line('');
}

main().catch((err) => {
  console.error(`analyze-playtest failed: ${err.message}`);
  process.exit(1);
});
