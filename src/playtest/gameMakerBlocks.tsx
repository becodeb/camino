// The blocks of "Hacé tu juego": paper cutouts like 3ro's rule cards (a
// yellow hat with its ear, the actions under it, coloured by what they do:
// moving blue, points and lives orange, looks lilac, avisar pale yellow, win
// and lose green), with a few words (4to reads) and a chip where a value can
// change: a tap cycles it.

import { memo, type ReactNode } from 'react';
import { DIMS } from '../game/editor';
import { HatEar, Paper, cardPath, startPath } from '../blocks/blocks';
import { MSG_WORD, SAY_WORD, kindOf, paramOf, type MsgId, type ObjId, type SayId } from '../game/gameMaker';
import type { Dir } from '../game/model';
import {
  AheadGlyph, ArrowGlyph, BubbleGlyph, EnvelopeGlyph, EyeGlyph, FlagGlyph, HeartGlyph, JarGlyphSmall, KeyGlyph, LoopGlyph, ObjIcon, StarGlyph, TopGlyph, UTurnGlyph,
} from './gameMakerArt';

export const HAT_W = 200;
export const HAT_H = 46;
export const ACT_W = 184;
export const ACT_H = 38;

/** What each action does, as the colour of its paper (the Scratch category's, softened into the notebook's pastels). */
const FILL: Record<string, string> = {
  hat: '#f3cf6e', move: '#a9c3de', turn: '#a9c3de', top: '#a9c3de', score: '#eeb483', lives: '#eeb483',
  say: '#dccbe6', vis: '#dccbe6', send: '#f6e3a8', win: '#cfdaa6', lose: '#cfdaa6',
};
export const fillOf = (id: string) => FILL[kindOf(id)] ?? '#e6dccb';

/** The chip's picture or word: what a tap cycles. */
function ChipFace({ id }: { id: string }) {
  const p = paramOf(id);
  switch (kindOf(id)) {
    case 'key': return <KeyGlyph dir={p as Dir} size={28} />;
    case 'touch': return p === 'ground' || p === 'edge'
      ? <><ObjIcon id={p} size={22} /><span className="gm-chip-w">{p === 'ground' ? 'suelo' : 'borde'}</span></>
      : <ObjIcon id={p as ObjId} size={28} />;
    case 'recv':
    case 'send': return <><EnvelopeGlyph msg={p as MsgId} size={22} /><span className="gm-chip-w">{MSG_WORD[p as MsgId]}</span></>;
    case 'move': return p === 'ahead' ? <><AheadGlyph size={22} /><span className="gm-chip-w">adelante</span></> : <ArrowGlyph dir={p as Dir} size={24} />;
    case 'say': return <span className="gm-chip-w">{SAY_WORD[p as SayId]}</span>;
    case 'vis': return <><EyeGlyph shut={p === 'hide'} size={20} /><span className="gm-chip-w">{p === 'hide' ? 'esconderse' : 'mostrarse'}</span></>;
    // points and lives: the word says up or down ("sumar" / "restar", "perder" / "ganar"), the chip the amount
    case 'score':
    case 'lives': return <span className="gm-chip-n">{Math.abs(Number(p))}</span>;
    default: return <span className="gm-chip-n">{p}</span>;
  }
}

export interface ChipProps {
  /** Where the chip is (object, card, action or null for the hat): taps cycle it. Absent in the palette. */
  at?: string;
  onChip?: () => void;
}

function Chip({ id, at, onChip }: { id: string } & ChipProps) {
  const face = <ChipFace id={id} />;
  if (!onChip) return <span className="gm-chip is-still">{face}</span>;
  return (
    <button
      type="button" className="gm-chip" data-chip={at} aria-label="Cambiar"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onChip(); }}
    >
      {face}
      <svg className="gm-chip-v" viewBox="0 0 10 6" aria-hidden="true"><path d="M1,1 L5,5 L9,1" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );
}

const W = ({ children }: { children: ReactNode }) => <span className="gm-w">{children}</span>;

/** The words, the glyph and the chip of a block. */
function Face({ id, chip }: { id: string; chip: ChipProps }) {
  const c = <Chip id={id} {...chip} />;
  const p = paramOf(id);
  switch (kindOf(id)) {
    case 'start': return <><W>al empezar</W><FlagGlyph size={26} /></>;
    case 'key': return <><W>cuando<br />aprieto</W>{c}</>;
    case 'tick': return <><W>siempre</W><LoopGlyph size={26} /></>;
    case 'touch': return <><W>cuando<br />toco {p === 'ground' || p === 'edge' ? 'el' : 'a'}</W>{c}</>;
    case 'recv': return <><W>cuando<br />recibo</W>{c}</>;
    case 'points': return <><W>si los puntos<br />llegan a</W>{c}</>;
    case 'lives0': return <><W>si las vidas<br />llegan a 0</W><HeartGlyph size={24} empty /></>;
    case 'move': return <><W>mover</W>{c}</>;
    case 'turn': return <><W>dar la vuelta</W><UTurnGlyph size={22} /></>;
    case 'top': return <><W>volver arriba</W><TopGlyph size={22} /></>;
    case 'score': return <><W>{Number(p) < 0 ? 'restar' : 'sumar'}</W>{c}<W>{Math.abs(Number(p)) === 1 ? 'punto' : 'puntos'}</W><JarGlyphSmall size={22} /></>;
    case 'lives': return <><W>{Number(p) < 0 ? 'perder' : 'ganar'}</W>{c}<W>vida</W><HeartGlyph size={20} empty={Number(p) < 0} /></>;
    case 'say': return <><W>decir</W>{c}<BubbleGlyph size={20} /></>;
    case 'send': return <><W>avisar</W>{c}</>;
    case 'vis': return <>{c}</>;
    case 'win': return <><W>ganás</W><StarGlyph size={24} /></>;
    case 'lose': return <><W>perdés</W><HeartGlyph size={22} empty /></>;
    default: return <W>{id}</W>;
  }
}

/** One of our blocks: a hat (rounded cap and ear) or an action (the puzzle notch), with its face. */
export const GmBlockArt = memo(function GmBlockArt({ id, hat, chip = {} }: { id: string; hat: boolean; chip?: ChipProps }) {
  const w = hat ? HAT_W : ACT_W, h = hat ? HAT_H : ACT_H;
  const d = { ...DIMS, h };
  return (
    <>
      <Paper d={hat ? startPath(w, h, d) : cardPath(w, h, d)} fill={fillOf(hat ? 'hat' : id)} w={w} h={h} />
      <span className={`gm-face${hat ? ' is-hat' : ''}`}><Face id={id} chip={chip} /></span>
      {hat && <HatEar />}
    </>
  );
});
