// 1ro's music recess (sheet 9) as pure data and functions. A xylophone of
// five bars, do to sol, lies on the grass; a note card is one beat: a bar
// (Brote hops onto it and it sounds) or a silence. A song is the beats it
// plays, in order, and a page asks for exactly that song: the run stops at
// the first beat that differs (the child hears it, the song strip shows the
// one that was due), a program that ends before the song does is "short",
// and a beat past the end of the song is a wrong one too. A free page has no
// song: any tune with a few notes is a concert.
//
// Runs come out as the engine's Trace, so the level page drives them like a
// walk: a note is a step onto its bar, a silence a step that stays put, a
// wrong beat the step that "crashes" (see songTrace).

import { unroll } from './engine';
import { NO_GOAL } from './formats';
import { isHole, type Board, type Cell, type Program, type RobotState, type Trace, type TraceStep } from './model';

export type Pitch = 'do' | 're' | 'mi' | 'fa' | 'sol';
/** The bars of the xylophone, from the longest (lowest) to the shortest. */
export const PITCHES: readonly Pitch[] = ['do', 're', 'mi', 'fa', 'sol'];
/** One beat of a song: a note, or a silence. */
export type Tone = Pitch | 'rest';
/** The palette's order: the bars from low to high, then the silence. */
export const TONES: readonly Tone[] = [...PITCHES, 'rest'];

/** The command id of a silence card. */
export const REST = 'rest';
/** The command id of a note card: `note:do` … `note:sol`, and `rest`. */
export const noteCmd = (t: Tone): string => (t === 'rest' ? REST : `note:${t}`);
export const isNoteCmd = (cmd: string) => cmd === REST || (cmd.startsWith('note:') && (PITCHES as readonly string[]).includes(cmd.slice(5)));
/** The beat a card plays, or null when it is not a note card. */
export function toneOf(cmd: string): Tone | null {
  if (cmd === REST) return 'rest';
  return isNoteCmd(cmd) ? (cmd.slice(5) as Pitch) : null;
}

export interface MusicDef {
  /** The song the page asks for, beat by beat. Absent on a free page. */
  song?: Tone[];
  /** A free page: no song to copy; a tune with at least `min` notes that sound is a concert. */
  free?: { min: number };
}

// ------------------------------------------------------------------ the xylophone as a board

/** Brote waits on the grass left of the xylophone (column 0); the bars are columns 1 to 5, do to sol. */
export const barCell = (p: Pitch): Cell => ({ c: PITCHES.indexOf(p) + 1, r: 0 });

/** The board of a music page: one row, Brote's spot and the five bars; no goal (the song is the goal). */
export function xylophone(seed: number): Board {
  return { cols: PITCHES.length + 1, rows: 1, start: { c: 0, r: 0 }, goal: NO_GOAL, goalKind: 'none', obstacles: [], pickups: [], deco: [], seed };
}

// ------------------------------------------------------------------ playing a notebook

const at = (c: Cell): RobotState => ({ c: c.c, r: c.r, mask: 0 });

/**
 * What a notebook of note cards plays, as a Trace. Each card is a beat and a
 * step: a note goes to its bar (`cells: [bar]`), a silence stays where Brote
 * is (kind `look`). The first beat that is not the song's is the step that
 * crashes: Brote still plays it (`to` is its bar), and `crash.at` is the bar
 * that was due (`out`: the song was already over). Won when the notebook
 * played the whole song and nothing more; on a free page, when `min` notes
 * sounded.
 */
export function songTrace(board: Board, def: MusicDef, program: Program): Trace {
  const steps: TraceStep[] = [];
  const song = def.song ?? [];
  let pos: Cell = board.start;
  let notes = 0;
  for (const [index, { cmd, ref }] of unroll(program).entries()) {
    const tone = toneOf(cmd);
    if (!tone) throw new Error(`not a note card: ${cmd}`);
    const to = tone === 'rest' ? pos : barCell(tone);
    const due: Tone | undefined = def.free ? tone : song[index];
    const ok = tone === due;
    steps.push({
      index, cmd, ref,
      kind: !ok ? 'crash' : tone === 'rest' ? 'look' : 'move',
      dir: to.c > pos.c ? 'right' : to.c < pos.c ? 'left' : 'up',
      from: at(pos), to: at(to), cells: tone === 'rest' ? [] : [to], collected: [], won: false,
      ...(ok ? {} : { crash: { at: due == null ? NO_GOAL : due === 'rest' ? pos : barCell(due), out: due == null } }),
    });
    pos = to;
    if (!ok) return { steps, final: at(pos), outcome: 'crash', crashAt: index };
    if (tone !== 'rest') notes++;
  }
  const done = def.free ? notes >= def.free.min : steps.length === song.length && song.length > 0;
  if (done && steps.length) steps[steps.length - 1].won = true;
  return { steps, final: at(pos), outcome: done ? 'win' : 'short' };
}

/** The beats a program plays (what the song strip shows of a free page's tune). */
export const tonesOf = (program: Program): Tone[] => unroll(program).map(({ cmd }) => toneOf(cmd)).filter((t): t is Tone => !!t);

/**
 * How a reference program splits its song into phrases, for the song strip:
 * every pass of a repeat is a phrase (the chorus shows as the same shape
 * again and again), and the cards around it make phrases of their own.
 */
export function phrasesOf(program: Program): number[] {
  const out: number[] = [];
  let flat = 0;
  for (const it of program) {
    if (it.t === 'cmd') { if (!isHole(it.cmd)) flat++; continue; }
    if (flat) { out.push(flat); flat = 0; }
    const n = it.body.filter((c) => !isHole(c)).length;
    for (let i = 0; i < (typeof it.count === 'number' ? it.count : 0); i++) if (n) out.push(n);
  }
  if (flat) out.push(flat);
  return out;
}

/** A tune is a motif played again when a shorter piece of it, repeated, makes it all (do mi do mi is do mi twice). */
export function isPrimitive<T>(motif: readonly T[]): boolean {
  const n = motif.length;
  for (let d = 1; d < n; d++) if (n % d === 0 && motif.every((x, i) => x === motif[i % d])) return false;
  return true;
}

/**
 * What makes two music pages the same (to keep a run of extras free of
 * repeats): one repeat of a motif is `mel:<motif>:<count>`, like the melody
 * family's; anything else is the song itself.
 */
export function melodyKey(solution: Program): string {
  const only = solution.length === 1 ? solution[0] : null;
  if (only?.t === 'loop' && typeof only.count === 'number') return `mel:${only.body.join(',')}:${only.count}`;
  return `song:${tonesOf(solution).join(',')}`;
}
