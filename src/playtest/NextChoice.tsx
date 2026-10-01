// "¿Cómo seguís?" (round 2): what a sheet shows in free play once its core
// pages are done, instead of the year's three doors (the first try showed
// that nobody understood them). Full screen, said aloud, five big drawn
// choices a six-year-old understands without reading: three ways on (a
// gentle hill: "más fácil", a flat path: "igual", a steep hill: "más
// difícil"; the plant at the end grows with the climb, as the doors'
// sprouts did), the challenge (its framed page, a trophy and what it sends
// to the garden), and "otro juego" (back to the menu). After every extra
// page and after the challenge, the child comes back here.
//
// Each tap logs `next_choice` {sheet, pick, n, time_ms}; a way on then
// opens the next page behind that door, which free play logs as before
// (`choice` {activity, door, sheet}, and the page's level_start/level_end
// with `page: 'extra'`, `door`), so the data stays comparable with round 1.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { DOORS, bossId, type Door, type Sheet } from '../curriculum/model';
import { rewardOf } from '../curriculum/motivation';
import { useProgress } from '../curriculum/progress';
import { bossOpen, doorsOpen, nextExtra, sheetHref } from '../curriculum/route';
import { RewardSvg } from '../screens/GardenScreen';
import { Bar } from '../screens/LevelBar';
import { PlayerFace } from '../screens/player';
import { useGhost } from '../screens/levelKit';
import { SeedPouch } from '../screens/yearKit';
import { PenRing, Stamp, ThenArrow } from '../ui/art';
import { PageThumb } from '../ui/thumbs';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { usePlaytest } from './context';
import { MenuBackArt } from './menuArt';
import { BossChoiceArt, PathArt } from './round2Art';

export type NextPick = Door | 'boss' | 'menu';

const WORD: Record<NextPick, string> = { easy: 'Más fácil.', medium: 'Igual.', hard: 'Más difícil.', boss: 'El desafío.', menu: 'Otro juego.' };
const CAPTION: Record<NextPick, string> = { easy: 'más fácil', medium: 'igual', hard: 'más difícil', boss: 'el desafío', menu: 'otro juego' };

export const NEXT_LINES = {
  first: '¿Cómo seguís? Elegí un camino: más fácil, igual o más difícil. O el desafío, o otro juego.',
  again: '¿Cómo seguís?',
};

/** How long a card is held before its name is said (a shorter press picks it). */
const HOLD_MS = 550;

function Task() {
  return (
    <span className="drawn-task" aria-hidden="true">
      <PlayerFace className="bar-face" />
      <ThenArrow />
      <span className="choice-q">?</span>
    </span>
  );
}

export function NextChoice({ sheet, n, onMenu }: { sheet: Sheet; n: number; onMenu: () => void }) {
  const api = usePlaytest();
  const p = useProgress();
  const rootRef = useRef<HTMLElement>(null);
  const ghost = useGhost(rootRef);
  const since = useRef(Date.now());
  const [lit, setLit] = useState<NextPick | null>(null);
  const held = useRef<{ id: NextPick; t: number; fired: boolean } | null>(null);
  const picked = useRef(false);
  const open = doorsOpen(sheet, p);
  const boss = bossOpen(sheet, p);
  const bossDone = !!p.solved[bossId(sheet)];
  const reward = rewardOf(sheet.n);
  const line = n <= 1 ? NEXT_LINES.first : NEXT_LINES.again;
  const picks: NextPick[] = [...DOORS, ...(sheet.boss ? ['boss' as const] : []), 'menu'];

  // said when it opens; the first time each card glows as it is named
  useEffect(() => {
    let off = () => {};
    const timers: number[] = [];
    const t = window.setTimeout(() => {
      off = speakWhenAllowed(line);
      if (n > 1) return;
      let at = 1400;
      for (const k of picks) {
        timers.push(window.setTimeout(() => setLit(k), at));
        at += 900;
      }
      timers.push(window.setTimeout(() => setLit(null), at));
    }, 450);
    return () => { clearTimeout(t); timers.forEach(clearTimeout); off(); };
    // once per visit of the screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (k: NextPick) => {
    if (picked.current) return;
    if ((k !== 'menu' && k !== 'boss' && !open) || (k === 'boss' && !boss)) { speak('Ese todavía está cerrado.'); return; }
    picked.current = true;
    stopSpeaking();
    api.log('next_choice', { sheet: sheet.n, pick: k, n, time_ms: Date.now() - since.current });
    if (k === 'menu') { onMenu(); return; }
    location.hash = k === 'boss' ? sheetHref(sheet.n, { kind: 'boss' }) : sheetHref(sheet.n, { kind: 'extra', door: k, i: nextExtra(sheet, k, p) });
  };

  const down = (k: NextPick) => {
    const h = { id: k, t: window.setTimeout(() => { h.fired = true; setLit(k); speak(WORD[k]); }, HOLD_MS), fired: false };
    held.current = h;
  };
  const up = () => { if (held.current) clearTimeout(held.current.t); };
  const click = (k: NextPick) => {
    const h = held.current;
    held.current = null;
    if (h?.id === k && h.fired) return;
    pick(k);
  };

  const art = (k: NextPick): ReactNode => {
    if (k === 'menu') return <span className="pp-next-menu-art"><MenuBackArt /></span>;
    if (k === 'boss') {
      return (
        <BossChoiceArt
          thumb={sheet.boss ? <PageThumb level={sheet.boss} place={{ x: -26, y: -28, width: 52, height: 58 }} /> : undefined}
          reward={reward ? <RewardSvg r={reward} silhouette={!bossDone} place={{ x: 4, y: 2, width: 44, height: 46 }} /> : undefined}
        />
      );
    }
    return <PathArt door={k} />;
  };

  return (
    <main ref={rootRef} className="level mode-next pp-next" data-sheet={sheet.n}>
      <Bar
        instruction={<Task />}
        title="¿Cómo seguís?"
        pages={null}
        aside={<SeedPouch />}
        onSpeak={() => speak(NEXT_LINES.first)}
        onHelp={() => { speak(NEXT_LINES.first); ghost([{ do: 'point', at: ['.pp-next-card[data-pick="easy"]', '.pp-next-card[data-pick="medium"]', '.pp-next-card[data-pick="hard"]'] }]); }}
      />
      <section className="pp-next-stage" aria-label="¿Cómo seguís?">
        <div className="sheet pp-next-sheet">
          <span className="tape tape-l" aria-hidden="true" />
          <span className="tape tape-r" aria-hidden="true" />
          <ul className="pp-next-cards">
            {picks.map((k, i) => {
              const shut = (k === 'boss' && !boss) || (DOORS.includes(k as Door) && !open);
              return (
                <li key={k} className={`is-${k}`} style={{ '--tilt': `${[-1.4, 0.9, -0.6, 1.3, -1][i % 5]}deg` } as CSSProperties}>
                  <button
                    type="button" className={`pp-next-card cut is-${k}${lit === k ? ' is-lit' : ''}${shut ? ' is-shut' : ''}`} data-pick={k} aria-label={CAPTION[k]}
                    onPointerDown={() => down(k)} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} onClick={() => click(k)}
                  >
                    {art(k)}
                    <span className="pp-next-caption" aria-hidden="true">{CAPTION[k]}</span>
                    {k === 'boss' && bossDone && <Stamp seed={sheet.n + 5} className="pp-next-stamp" />}
                    {lit === k && <PenRing seed={i + 3} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </main>
  );
}
