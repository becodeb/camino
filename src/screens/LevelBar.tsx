// The top bar of a level: the 🔊 that repeats the spoken instruction, the
// instruction drawn (Brote ··> seed ··> pot), the title in small print for the
// adult, the tramo's pages with their stamps, and the raised hand (Ayuda).

import { Fragment } from 'react';
import { CHARACTERS } from '../ink/characters.js';
import { GRADES, levelsOf, type LevelDef } from '../game/levels';
import { HelpIcon, SpeakerIcon } from '../ui/icons';
import { JarIcon, PageIcon, PenRing, Portrait, PotIcon, SeedIcon, Stamp, ThenArrow } from '../ui/art';

export const BROTE = CHARACTERS[0];

/** The tramo's pages, grade by grade: stamped, the one on screen, blank, or not drawn yet. */
export function TramoPages({ current, stamps }: { current: string; stamps: ReadonlySet<string> }) {
  return (
    <ol className="tramo" aria-label="Hojas">
      {GRADES.map((g) => {
        const pages = levelsOf(g.id);
        return (
          <li key={g.id} className="tramo-grade">
            {[1, 2].map((n) => {
              const l = pages.find((x) => x.page === n);
              const state = !l ? 'future' : l.id === current ? 'here' : stamps.has(l.id) ? 'done' : 'todo';
              return (
                <span key={n} className={`tramo-page is-${state}`} aria-label={l ? `${g.label}, hoja ${n}${stamps.has(l.id) ? ', hecha' : ''}` : undefined}>
                  <PageIcon state={state === 'here' ? 'todo' : state} seed={n + g.id.length} />
                  {l && stamps.has(l.id) && <Stamp seed={n + 3} className={state === 'here' ? 'is-new' : ''} />}
                  {state === 'here' && <PenRing seed={n + 7} />}
                </span>
              );
            })}
          </li>
        );
      })}
    </ol>
  );
}

/** The instruction, drawn: Brote, then what he goes to fetch, then where he takes it (3ro page 2: seeds into the jar). */
export function DrawnInstruction({ level }: { level: LevelDef }) {
  const b = level.worlds[0];
  const chain = b.goalKind === 'none' ? ['seed' as const, 'jar' as const] : [...b.pickups.map(() => 'seed' as const), b.goalKind];
  return (
    <span className="drawn-task" aria-hidden="true">
      <Portrait def={BROTE} className="bar-face" />
      {chain.map((k, i) => (
        <Fragment key={i}>
          <ThenArrow />
          {k === 'pot' ? <PotIcon size={42} /> : k === 'jar' ? <JarIcon size={42} /> : <SeedIcon size={42} />}
        </Fragment>
      ))}
    </span>
  );
}

export function LevelBar({ level, stamps, onSpeak, onHelp }: { level: LevelDef; stamps: ReadonlySet<string>; onSpeak: () => void; onHelp: () => void }) {
  const grade = GRADES.find((g) => g.id === level.grade)!;
  return (
    <header className="level-bar cut" data-zone="bar">
      <button type="button" className="speak cut" aria-label="Escuchar otra vez" onClick={onSpeak}>
        <SpeakerIcon />
      </button>
      <DrawnInstruction level={level} />
      <h1 className="adult-title"><b>{grade.label} · {level.page}</b> {level.title}</h1>
      <TramoPages current={level.id} stamps={stamps} />
      <button type="button" className="help cut" aria-label="Ayuda" title="Ayuda" onClick={onHelp}>
        <HelpIcon />
      </button>
    </header>
  );
}
