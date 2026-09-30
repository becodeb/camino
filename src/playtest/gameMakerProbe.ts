// "Hacé tu juego" (the 4to probe) as data and rules, apart from its screen
// (GameMaker.tsx): the guided phases and when each one counts as done, what
// is said, the Scratch scripts of the prediction task and their answers.
//
// Phases: 1 `play` a ready-made game (catch the seeds, a stone takes a
// life); 2 `change` one rule (a seed worth 2 points, say) and play again; 3
// `make` your own variant (rules, the bird, "avisar", how to win) and play
// it; then `predict` (three small Scratch scripts: what happens?) and the
// liking question. The next page shows up once the phase's goal is met, or
// after a while anyway (nobody gets stuck); `completed` says which.

import type { SBlock } from '../game/gameMaker';

export type GmPhase = 'play' | 'change' | 'make';
export const PHASES: readonly GmPhase[] = ['play', 'change', 'make'];

/** What a phase has seen so far. */
export interface PhaseTrack {
  startedAt: number;
  /** Games played (▶ to their end: won, lost, stopped). */
  runs: number;
  /** Games in which the child pressed at least one arrow. */
  played: number;
  /** A game ended by winning or losing. */
  ended: number;
  firstRunAt: number | null;
  /** Edits of the rules in this phase (add, remove, change). */
  edits: number;
  firstEditAt: number | null;
  /** Games started after the phase's first edit. */
  runsAfterEdit: number;
}

export const newTrack = (now: number): PhaseTrack => ({ startedAt: now, runs: 0, played: 0, ended: 0, firstRunAt: null, edits: 0, firstEditAt: null, runsAfterEdit: 0 });

/** Phase 1 is played for about a minute: the page may turn after a game ends, or this long after the first ▶. */
export const PLAY_MS = 45_000;
/** Whatever happens, the next page shows up after this long in the phase. */
export const PHASE_FALLBACK_MS: Record<GmPhase, number> = { play: 90_000, change: 180_000, make: 240_000 };

/** The phase did what it asks for. */
export function phaseCompleted(phase: GmPhase, t: PhaseTrack): boolean {
  if (phase === 'play') return t.played > 0;
  return t.edits > 0 && t.runsAfterEdit > 0;
}

/** The next page can show: the goal is met (phase 1: a game ended, or a minute of play), or the fallback time passed. */
export function phaseReady(phase: GmPhase, t: PhaseTrack, now: number): boolean {
  if (now - t.startedAt >= PHASE_FALLBACK_MS[phase]) return true;
  if (phase === 'play') return t.played > 0 && (t.ended > 0 || (t.firstRunAt != null && now - t.firstRunAt >= PLAY_MS));
  return phaseCompleted(phase, t);
}

/** A game started: counts for "played again after the change". */
export function trackRunStart(t: PhaseTrack, now: number): PhaseTrack {
  return { ...t, firstRunAt: t.firstRunAt ?? now, runsAfterEdit: t.runsAfterEdit + (t.firstEditAt != null ? 1 : 0) };
}
export function trackRunEnd(t: PhaseTrack, r: { keys: number; result: 'win' | 'lose' | 'stopped' }): PhaseTrack {
  return { ...t, runs: t.runs + 1, played: t.played + (r.keys > 0 ? 1 : 0), ended: t.ended + (r.result === 'stopped' ? 0 : 1) };
}
export function trackEdit(t: PhaseTrack, now: number): PhaseTrack {
  return { ...t, edits: t.edits + 1, firstEditAt: t.firstEditAt ?? now };
}

// ------------------------------------------------------------------ what is said (es-AR; "Brote" becomes the child's character)

export const GM_LINES: Record<GmPhase, string> = {
  play: 'Este juego está hecho con reglas. Tocá Probar y atrapá las semillas con las flechas. ¡Ojo con las piedras!',
  change: 'Ahora cambiá una regla. Por ejemplo, que cada semilla valga 2 puntos: tocá el número de la regla. Después jugá otra vez.',
  make: '¡Ahora es tu juego! Agregá reglas, cambiá cosas o sumá al pájaro. Probá avisar: una cosa avisa y otra contesta. Después jugalo.',
};
export const GM_SAY = {
  orphan: 'Esto va debajo de un cuando.',
  won: '¡Ganaste!',
  lost: '¡Se acabaron las vidas! ¿Otra vez?',
  predictIntro: 'Ahora, un poco de Scratch. Mirá el programa y adiviná qué pasa. Tocá un dibujo.',
  liked: '¿Te gustó hacer tu juego? Tocá una carita: mucho, más o menos, o no.',
  cheer: '¡Qué buen juego hiciste!',
};

/** The phase as the adult's small print says it. */
export const PHASE_NAME: Record<GmPhase, string> = { play: '1 · jugar el juego', change: '2 · cambiar una regla', make: '3 · hacer tu juego' };

// ------------------------------------------------------------------ predict a Scratch script

/** What an answer shows: a drawn outcome on a tiny board. */
export type OutcomeId = 'right' | 'up' | 'say_hola' | 'star_points' | 'star_says' | 'life_lost' | 'bird_says' | 'stone_says' | 'nobody';

export interface PredictItem {
  id: 'key' | 'star' | 'broadcast';
  /** The question, said and written (with the character's name). */
  say: string;
  /** Each sprite's script: `sprite` names whose it is (drawn beside it). */
  scripts: { sprite: 'me' | 'star' | 'stone' | 'bird'; blocks: SBlock[] }[];
  options: readonly OutcomeId[];
  answer: OutcomeId;
}

const hat = (parts: SBlock['parts']): SBlock => ({ cat: 'events', shape: 'hat', parts });
const flag = (): SBlock => hat(['al hacer clic en', { in: '', kind: 'flag' }]);

/** The three fixed items (the same for every child), the right answer at a different place each time. */
export function predictItems(me: string): PredictItem[] {
  return [
    {
      id: 'key',
      say: '¿Qué pasa cuando apretás la flecha derecha?',
      scripts: [{ sprite: 'me', blocks: [
        hat(['al presionar tecla', { in: 'flecha derecha', kind: 'drop' }]),
        { cat: 'motion', shape: 'stack', parts: ['cambiar x en', { in: '40', kind: 'num' }] },
      ] }],
      options: ['up', 'right', 'say_hola'],
      answer: 'right',
    },
    {
      id: 'star',
      say: `¿Qué pasa cuando ${me} toca la estrella?`,
      scripts: [{ sprite: 'star', blocks: [
        flag(),
        { cat: 'control', shape: 'c', parts: ['por siempre'], body: [
          { cat: 'control', shape: 'c', parts: ['si', { in: `¿tocando ${me}?`, kind: 'bool', cat: 'sensing' }, 'entonces'], body: [
            { cat: 'variables', shape: 'stack', parts: ['sumar', { in: '1', kind: 'num' }, 'a', { in: 'puntos', kind: 'drop' }] },
            { cat: 'looks', shape: 'stack', parts: ['esconder'] },
          ] },
        ] },
      ] }],
      options: ['star_points', 'star_says', 'life_lost'],
      answer: 'star_points',
    },
    {
      id: 'broadcast',
      say: `Cuando la piedra toca a ${me}, ¿quién habla?`,
      scripts: [
        { sprite: 'stone', blocks: [
          flag(),
          { cat: 'control', shape: 'c', parts: ['por siempre'], body: [
            { cat: 'control', shape: 'c', parts: ['si', { in: `¿tocando ${me}?`, kind: 'bool', cat: 'sensing' }, 'entonces'], body: [
              { cat: 'events', shape: 'stack', parts: ['enviar', { in: '¡ay!', kind: 'drop' }] },
            ] },
          ] },
        ] },
        { sprite: 'bird', blocks: [
          hat(['al recibir', { in: '¡ay!', kind: 'drop' }]),
          { cat: 'looks', shape: 'stack', parts: ['decir', { in: '¡Cuidado!', kind: 'text' }, 'por', { in: '2', kind: 'num' }, 'segundos'] },
        ] },
      ],
      options: ['stone_says', 'nobody', 'bird_says'],
      answer: 'bird_says',
    },
  ];
}

/** Said when an answer is tapped (never right or wrong: the answer is only logged). */
export const OUTCOME_SAY: Record<OutcomeId, string> = {
  right: 'Brote se mueve a la derecha.',
  up: 'Brote sube.',
  say_hola: 'Brote dice hola.',
  star_points: 'Suma un punto y la estrella se esconde.',
  star_says: 'La estrella dice hola.',
  life_lost: 'Brote pierde una vida.',
  bird_says: 'El pájaro dice: ¡cuidado!',
  stone_says: 'La piedra dice: ¡ay!',
  nobody: 'Nadie habla.',
};
