// The wardrobe (el vestidor): the child picks a character (Brote, Mina,
// Pliegue, Ovillo) and dresses it with what the year earned. The four
// characters stand in a column on the left (each shown in the current
// outfit), the chosen one lives in the middle on a rag rug (it breathes,
// blinks, follows the pointer, laughs when tapped, cheers a new piece), and
// the wooden wardrobe on the right holds every piece on a hook: the unlocked
// ones in colour (a tap puts one on, another tap takes it off), the rest as
// silhouettes with what unlocks them drawn under them (a seed and how many,
// or the page of a sheet); a tap on one says it. Nothing is bought and seeds
// are never spent. The wardrobe only opens when the teacher opens it at the
// end of a class (the dev drawer's switch in this demo; always in dev mode):
// shut, its doors carry a wooden bar and the character only waits.

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CHARACTERS } from '../ink/characters.js';
import { CHARACTER_NAME, ITEMS, itemKey, type CharacterId, type Item } from '../curriculum/motivation';
import { chooseCharacter, markSeen, progress, useProgress } from '../curriculum/progress';
import { isUnlocked, newItems, outfitOf, unlockSay, wear } from '../curriculum/rewards';
import { MAP_HREF, sheetHref } from '../curriculum/route';
import { useDev } from '../ui/devMode';
import { REDUCED } from '../ui/runtime';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { NextPageArt, PenRing, Portrait, ThenArrow } from '../ui/art';
import { StarSticker } from '../ui/workshopArt';
import { ItemIcon, Mirror, Rug, UnlockTag, WardrobeIcon } from '../ui/wardrobeArt';
import { PencilSky, Pine, Tree, Tuft } from '../ui/forestArt';
import type { StageView } from '../ui/board/StageView';
import { Bar } from './LevelBar';
import { Quit, useGhost } from './levelKit';
import { PlayerFace, usePlayer, useStage } from './player';
import { SeedPouch, withSheetLine } from './yearKit';

const LINES = {
  open: 'Elegí tu personaje y qué ponerle. Lo que ganaste está colgado en el ropero.',
  shut: 'El ropero se abre al final de la clase.',
  picked: (name: string) => `Elegiste a ${name}.`,
  worn: (item: Item) => `¡${item.name.charAt(0).toUpperCase()}${item.name.slice(1)}!`,
};

/** The wardrobe's picture and the character, drawn in the bar. */
function WardrobeTask({ open }: { open: boolean }) {
  return (
    <span className="drawn-task" aria-hidden="true">
      <PlayerFace className="bar-face" />
      <ThenArrow />
      <WardrobeIcon open={open} size={44} />
    </span>
  );
}

/** A hook with a piece hanging from it (unlocked, worn, or a silhouette with what unlocks it). */
function Hook({ item, worn, locked, fresh, onTap }: { item: Item; worn: boolean; locked: boolean; fresh: boolean; onTap: (el: HTMLElement) => void }) {
  const label = locked ? `${item.name}: ${unlockSay(item.unlock)}` : `${item.name}${worn ? ', puesta' : ''}`;
  return (
    <li className="hook">
      <svg className="hook-art" viewBox="-12 -14 24 22" aria-hidden="true">
        <path d="M0,-12 L0,-4 Q0,4 -6,4 Q-10,4 -10,0" fill="none" stroke="#2b2622" strokeWidth={4.4} strokeLinecap="round" />
        <path d="M0,-12 L0,-4 Q0,4 -6,4 Q-10,4 -10,0" fill="none" stroke="#c9a15a" strokeWidth={2.2} strokeLinecap="round" />
      </svg>
      <button
        type="button"
        className={`prenda cut${worn ? ' is-on' : ''}${locked ? ' is-locked' : ''}${fresh ? ' is-new' : ''}`}
        data-prenda={item.id} data-locked={locked || undefined} data-on={worn || undefined}
        aria-label={label} aria-pressed={locked ? undefined : worn}
        onClick={(e) => onTap(e.currentTarget)}
      >
        <ItemIcon id={item.id} className="prenda-art" />
        {locked && <UnlockTag unlock={item.unlock} />}
        {worn && <PenRing seed={item.id.length + 3} />}
        {fresh && !locked && <span className="prenda-new"><StarSticker /></span>}
      </button>
    </li>
  );
}

export function WardrobePage() {
  const p = useProgress();
  const dev = useDev();
  const open = p.wardrobe || dev.on;
  const player = usePlayer();
  const rootRef = useRef<HTMLElement>(null);
  const ghost = useGhost(rootRef);
  const { ref, view } = useStage(player, { x: -92, y: -176, w: 184, h: 196 }, { shadow: false });
  const worn = outfitOf(p);
  // the pieces new when the wardrobe opened: they keep their star sticker during the visit
  const [fresh] = useState(() => new Set(newItems(progress.get())));
  const line = open ? LINES.open : LINES.shut;

  useEffect(() => {
    let off = () => {};
    const t = setTimeout(() => { off = speakWhenAllowed(line); }, 450);
    return () => { clearTimeout(t); off(); stopSpeaking(); };
  }, [line]);

  // what was new is greeted: seen once the wardrobe was open for a moment
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => progress.update((q) => markSeen(q, newItems(q).map(itemKey))), REDUCED ? 0 : 2500);
    return () => clearTimeout(t);
  }, [open]);

  const pick = (id: CharacterId) => {
    if (!open) { speak(LINES.shut); return; }
    if (id === p.character && p.picked) { void view.current?.nod(); return; }
    progress.update((q) => chooseCharacter(q, id));
    speak(LINES.picked(CHARACTER_NAME[id]));
    setTimeout(() => void view.current?.cheer(false), REDUCED ? 0 : 420);
  };

  const tapItem = (item: Item, el: HTMLElement) => {
    if (!open) { speak(LINES.shut); return; }
    const r = el.getBoundingClientRect();
    view.current?.look(r.left + r.width / 2, r.top + r.height / 2);
    if (!isUnlocked(item, p)) {
      speak(unlockSay(item.unlock));
      if (!REDUCED) el.animate([{ rotate: '0deg' }, { rotate: '-6deg' }, { rotate: '5deg' }, { rotate: '-3deg' }, { rotate: '0deg' }], { duration: 480, easing: 'ease-out' });
      return;
    }
    const on = worn[item.slot] === item.id;
    progress.update((q) => wear(q, item.id));
    if (!on) speak(LINES.worn(item));
    setTimeout(() => void (on ? view.current?.nod() : view.current?.cheer(false)), REDUCED ? 0 : 420);
  };

  const help = () => {
    if (!open) { ghost([{ do: 'point', at: ['.ropero'] }]); return; }
    const next = ITEMS.find((i) => isUnlocked(i, p) && worn[i.slot] !== i.id);
    ghost([{ do: 'point', at: [next ? `[data-prenda="${next.id}"]` : '.cast-btn'] }]);
  };

  return (
    <main ref={rootRef} className={`level mode-wardrobe${open ? '' : ' is-shut'}`} data-open={open || undefined}>
      <Bar
        instruction={<WardrobeTask open={open} />}
        title={<><b>Vestidor{open ? '' : ' · cerrado'}</b> Personaje y ropa ganada; lo abre el docente al final de la clase</>}
        pages={null}
        aside={<SeedPouch />}
        onSpeak={() => speak(line)}
        onHelp={help}
      />
      <section className="wardrobe-stage" aria-label="El vestidor">
        <ul className="cast" aria-label="Personajes">
          {CHARACTERS.map((c) => {
            const here = c.id === p.character;
            return (
              <li key={c.id}>
                <button
                  type="button" className={`cast-btn cut${here ? ' is-here' : ''}`} style={{ '--fill': c.color } as CSSProperties}
                  data-cast={c.id} aria-pressed={here} aria-label={CHARACTER_NAME[c.id as CharacterId]} disabled={!open && !here}
                  onClick={() => pick(c.id as CharacterId)}
                >
                  <Portrait def={c} outfit={worn} className="cast-face" />
                  {here && <PenRing seed={c.id.length} />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="sheet mirror">
          <span className="tape tape-l" aria-hidden="true" />
          <span className="tape tape-r" aria-hidden="true" />
          <svg className="mirror-rug" viewBox="-92 -176 184 196" aria-hidden="true"><g transform="translate(0 -6) scale(0.98)"><Mirror /></g><g transform="translate(0 4) scale(1.05)"><Rug /></g></svg>
          <svg ref={ref} className="mirror-stage" role="img" aria-label={`${CHARACTER_NAME[player.def.id]}${Object.keys(worn).length ? ' con su ropa' : ''}`} />
        </div>
        <div className={`ropero${open ? ' is-open' : ''}`}>
          <span className="ropero-top" aria-hidden="true" />
          {open ? (
            <ul className="hooks" aria-label="La ropa">
              {ITEMS.map((item) => (
                <Hook key={item.id} item={item} worn={worn[item.slot] === item.id} locked={!isUnlocked(item, p)} fresh={fresh.has(item.id)} onTap={(el) => tapItem(item, el)} />
              ))}
            </ul>
          ) : (
            <div className="ropero-doors" aria-label="El ropero, cerrado">
              <span className="ropero-door"><i className="ropero-knob" /></span><span className="ropero-door"><i className="ropero-knob" /></span>
              <span className="ropero-bar" aria-hidden="true" />
            </div>
          )}
        </div>
        <a className="next-page cut wardrobe-next" href={MAP_HREF} aria-label="Volver al mapa"><NextPageArt /></a>
      </section>
      <Quit href={MAP_HREF} />
    </main>
  );
}

// ------------------------------------------------------------------ sheet 1: the child picks a character

const CHOICE_LINES = {
  ask: 'Elegí con quién vas a recorrer el bosque. Tocá un personaje.',
  picked: (name: string) => `¡Elegiste a ${name}! Tocá la hoja para empezar.`,
};

/** One of the four on its stump, alive: a tap picks it. */
function ChoiceStage({ id, here, onPick, stage }: { id: CharacterId; here: boolean; onPick: () => void; stage: (id: CharacterId, v: StageView | null) => void }) {
  const def = CHARACTERS.find((c) => c.id === id)!;
  const { ref, view } = useStage({ def, outfit: {} }, { x: -62, y: -132, w: 124, h: 142 });
  useEffect(() => { stage(id, view.current); return () => stage(id, null); });
  return (
    <button type="button" className={`choice-btn${here ? ' is-here' : ''}`} data-choice-char={id} aria-pressed={here} aria-label={CHARACTER_NAME[id]} onClick={onPick}>
      <svg className="choice-stump" viewBox="-62 -132 124 142" aria-hidden="true"><Stump seed={id.length} /></svg>
      <svg ref={ref} className="choice-stage" aria-hidden="true" />
      {here && <PenRing seed={id.length + 11} />}
    </button>
  );
}

/** A tree stump to stand on, its rings on top. */
function Stump({ seed }: { seed: number }) {
  return (
    <g strokeLinejoin="round" strokeLinecap="round" stroke="#2b2622">
      <ellipse cx={4} cy={14} rx={54} ry={10} fill="url(#hatch)" stroke="none" />
      <path d={`M-44,-2 L-42,12 Q0,24 42,12 L44,-2 Z`} fill="#a57c55" strokeWidth={2.6} />
      <path d="M-20,4 L-21,16 M8,6 L9,18 M28,2 L29,13" strokeWidth={1.4} opacity={0.45} />
      <ellipse cx={0} cy={-2} rx={44} ry={11} fill="#e3c79a" strokeWidth={2.6} />
      <ellipse cx={0} cy={-2} rx={28} ry={6.5} fill="none" strokeWidth={1.3} opacity={0.5} />
      <ellipse cx={1} cy={-2} rx={13} ry={3.2} fill="none" strokeWidth={1.3} opacity={0.5} />
      <path d={`M${36 - seed},-12 q6,-10 14,-8 q-4,8 -14,8 Z`} fill="#a4b86d" strokeWidth={1.6} />
    </g>
  );
}

/**
 * Sheet 1 opens on the character choice the first time: the four stand on
 * stumps in the forest, each alive; a tap picks one (it celebrates, the others
 * look at it), and the page to turn leads to the sheet's first page. The
 * wardrobe changes it later. The pilot playtest reuses it: `onPick` hears
 * each pick, `next` replaces the link to the sheet's first page, `quit`
 * null hides "salir", `title` replaces the adult's small print.
 */
export function ChoicePage({ sheet, pages, onPick, next, quit = MAP_HREF, title }: {
  sheet: { n: number; say: string; title: string };
  pages: React.ReactNode;
  onPick?: (id: CharacterId) => void;
  next?: () => void;
  quit?: string | null;
  title?: React.ReactNode;
}) {
  const p = useProgress();
  const rootRef = useRef<HTMLElement>(null);
  const ghost = useGhost(rootRef);
  const stages = useRef(new Map<CharacterId, StageView>());
  const picked = p.picked ? p.character : null;
  const line = picked ? CHOICE_LINES.picked(CHARACTER_NAME[picked]) : CHOICE_LINES.ask;

  useEffect(() => {
    let off = () => {};
    const t = setTimeout(() => { off = speakWhenAllowed(withSheetLine(sheet, CHOICE_LINES.ask)); }, 450);
    return () => { clearTimeout(t); off(); stopSpeaking(); };
    // once per page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (id: CharacterId) => {
    progress.update((q) => chooseCharacter(q, id));
    onPick?.(id);
    speak(CHOICE_LINES.picked(CHARACTER_NAME[id]));
    const me = stages.current.get(id);
    void me?.cheer();
    const r = me?.svg.getBoundingClientRect();
    if (r) stages.current.forEach((v, k) => { if (k !== id) v.look(r.left + r.width / 2, r.top + r.height / 2, 1800); });
  };

  const help = () => { ghost([{ do: 'point', at: picked ? ['.next-page'] : ['.choice-btn'] }]); };

  return (
    <main ref={rootRef} className="level mode-doors mode-choice" data-sheet={sheet.n}>
      <Bar
        instruction={<span className="drawn-task" aria-hidden="true"><PlayerFace className="bar-face" /><ThenArrow /><span className="choice-q">?</span></span>}
        title={title ?? <><b>Hoja {sheet.n} · elegir personaje</b> {sheet.title}</>}
        pages={pages}
        aside={<SeedPouch />}
        onSpeak={() => speak(line)}
        onHelp={help}
      />
      <section className="doors-stage" aria-label="Elegí tu personaje">
        <div className="sheet doors-sheet choice-sheet">
          <span className="tape tape-l" aria-hidden="true" />
          <span className="tape tape-r" aria-hidden="true" />
          <svg className="doors-svg choice-scene" viewBox="0 0 1200 600" aria-hidden="true"><ClearingScenery /></svg>
          <div className="choice-row">
            {CHARACTERS.map((c) => (
              <ChoiceStage key={c.id} id={c.id as CharacterId} here={picked === c.id} onPick={() => pick(c.id as CharacterId)}
                stage={(id, v) => { if (v) stages.current.set(id, v); else stages.current.delete(id); }} />
            ))}
          </div>
        </div>
        {picked
          ? next
            ? <button type="button" className="next-page cut doors-next" onClick={next} aria-label="Seguir"><NextPageArt /></button>
            : <a className="next-page cut doors-next" href={sheetHref(sheet.n, { kind: 'core', k: 1 })} aria-label="Empezar la hoja"><NextPageArt /></a>
          : <span className="doors-next-slot" aria-hidden="true" />}
      </section>
      {quit != null && <Quit href={quit} />}
    </main>
  );
}

/** A clearing in the forest: the pencil sky, the meadow, trees at the edges. */
function ClearingScenery() {
  const G = 470;
  return (
    <g>
      <PencilSky />
      <path d={`M0,${G} Q300,${G - 14} 600,${G - 4} T1200,${G - 8} L1200,600 L0,600 Z`} fill="#eef0da" />
      <path d={`M0,${G} Q300,${G - 14} 600,${G - 4} T1200,${G - 8}`} fill="none" stroke="#2b2622" strokeWidth={2.2} opacity={0.5} />
      <Pine x={60} y={G + 8} s={1.5} seed={911} />
      <Tree x={170} y={G + 4} s={1.2} seed={912} />
      <Tree x={1040} y={G + 2} s={1.25} seed={913} />
      <Pine x={1150} y={G + 8} s={1.45} seed={914} />
      {[[250, 560], [520, 578], [780, 566], [980, 574], [120, 580]].map(([x, y], i) => <Tuft key={i} x={x} y={y} seed={i + 60} s={1.4} />)}
    </g>
  );
}
