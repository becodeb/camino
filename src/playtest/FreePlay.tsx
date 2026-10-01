// Free play (10–15 min): a drawn menu of 3–4 activities for the child's
// grade (freePlay.ts), picked with one tap; each card's name is said when the
// menu opens and when the card is held. An activity is the year's own screen
// with the session's progress: a sheet with its doors and boss, the music
// recess, the guardas, the workshop and its corkboard (SheetScreen, moving by
// the hash the playtest holds: hashHold.ts), the rule game's pages, or a
// probe (probes.ts). A drawn "volver al menú" button is always there.
//
// Logged: `choice` {activity, visit} on every pick, `choice` {activity, door}
// when a door is chosen, every page's level_start/run/level_end with its
// `activity` (sheet pages add `sheet`, `page` core|extra|boss|test|card and
// `door`), and `activity_end` {activity, visit, time_ms, levels, wins,
// extras, reason} when the child leaves it (v_activity_time sums these).
// Every page solved plants a seed (PlaytestLevel).
//
// Time: when the budget (12 min, `?libre=<min>`) runs out, nothing is cut:
// on the menu the step moves on at once; with a level open, when it ends (or
// the child moves to another page); on a page that is not a level (the doors,
// the editor, the corkboard), at the next page or after a short grace. Then
// a gentle cheer, "¡Ahora vamos a otro juego!", and the next step. The adult
// can skip the step from the corner menu.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { markPreviewed, progress } from '../curriculum/progress';
import { PRIMER, sheetByN } from '../curriculum/primer';
import { entryPage, parseRoute, type SheetPage } from '../curriculum/route';
import { DEBUG, LevelWrapContext, useGhost, type LevelWrap } from '../screens/levelKit';
import { Bar } from '../screens/LevelBar';
import { PlayerFace } from '../screens/player';
import { SheetScreen } from '../screens/SheetScreen';
import { SeedPouch } from '../screens/yearKit';
import { ThenArrow } from '../ui/art';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { usePlaytest } from './context';
import { activityFor, budgetFrom, budgetVerdict, menuFor, MENU_LINES, type Activity, type ProbeId } from './freePlay';
import { setHashConsumer } from './hashHold';
import { Cheer, WalkOn } from './interlude';
import type { LevelDef } from '../game/levels';
import { pilotLevel, RULE_GAME_PAGES } from './levels';
import { ActivityArt, MenuBackArt } from './menuArt';
import { InstrumentedPage, PlaytestLevel, type LevelEnd } from './PlaytestLevel';
import { hasProbe, OPEN_PROBE_EVENT, PROBES } from './probes';
import { rememberPart, resumedPart } from './resume';
import { NextChoice } from './NextChoice';
import { BarProgressContext, type BarProgress } from './barProgress';
import { coreId } from '../curriculum/model';
import { solve, useProgress } from '../curriculum/progress';

/** How long a card is held before its name is said (a shorter press picks it). */
const HOLD_MS = 550;
/** How often the time is looked at. */
const TICK_MS = 5000;

type View =
  | { kind: 'menu'; n: number }
  | { kind: 'activity'; a: Activity; n: number; page: SheetPage | null }
  | { kind: 'over' };

/** An activity on screen: what its `activity_end` will say. */
interface Visit { a: Activity; n: number; at: number; levels: number; wins: number; extras: number }

/** A sheet page as level_start/level_end tell it: which sheet, which kind of page, which door. */
function pageInfo(n: number, page: SheetPage | null): Record<string, unknown> {
  if (!page) return {};
  const kind = page.kind === 'core' || page.kind === 'extra' || page.kind === 'boss' ? page.kind
    : page.kind === 'probar' ? 'test' : page.kind === 'tarjeta' ? 'card' : page.kind;
  return {
    sheet: n,
    page: 'gold' in page && page.gold ? `${kind}_gold` : kind,
    ...(page.kind === 'extra' ? { door: page.door } : {}),
  };
}

export function FreePlay() {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const grade = api.session?.grade ?? 1;
  const [menu] = useState(() => menuFor(grade, hasProbe));
  const [budget, setBudget] = useState(() => budgetFrom(location.search));
  // a reloaded tab carries on with free play's clock and visit count (resume.ts); the child is back on the menu
  const [kept] = useState(() => resumedPart<{ startedAt: number; visits: number }>('free_play'));
  const startedAt = useRef(kept?.startedAt ?? Date.now());
  const [view, setView] = useState<View>({ kind: 'menu', n: kept?.visits ?? 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const visit = useRef<Visit | null>(null);
  /** Activities picked so far (the `visit` number of choice and activity_end). */
  const visits = useRef(kept?.visits ?? 0);
  const keep = () => rememberPart('free_play', { startedAt: startedAt.current, visits: visits.current });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(keep, []);
  /** "¿Cómo seguís?": how many times it was shown in this visit (its `next_choice.n`). */
  const choiceShown = useRef(0);
  /** Level pages open inside a sheet activity (the wrap counts them). */
  const levelsOpen = useRef(0);
  /** When the time ran out while something was open. */
  const due = useRef<number | null>(null);
  const finished = useRef(false);

  // the playtest's sheets never show the year's "tomorrow…" card
  useEffect(() => { progress.update((p) => PRIMER.reduce((q, s) => markPreviewed(q, s.n), p)); }, []);

  const log = (type: string, payload: Record<string, unknown>) => apiRef.current.log(type, payload);

  const closeVisit = (reason: 'menu' | 'done' | 'budget' | 'left') => {
    const v = visit.current;
    if (!v) return;
    visit.current = null;
    log('activity_end', { activity: v.a.id, visit: v.n, time_ms: Date.now() - v.at, levels: v.levels, wins: v.wins, extras: v.extras, reason });
  };

  /** Why the open activity is being left: its activity_end is logged once it is off screen (after its last page's level_end). */
  const leaving = useRef<'menu' | 'done' | 'budget'>('budget');

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    setView({ kind: 'over' });
  };

  const toMenu = (reason: 'menu' | 'done') => {
    if (finished.current) return;
    leaving.current = reason;
    if (due.current != null) { finish(); return; }
    setView({ kind: 'menu', n: visits.current });
  };

  useEffect(() => {
    if (view.kind !== 'activity') closeVisit(leaving.current);
    leaving.current = 'budget';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const pick = (a: Activity, by?: 'adult') => {
    if (finished.current || viewRef.current.kind !== 'menu') return;
    const n = ++visits.current;
    keep();
    stopSpeaking();
    log('choice', { activity: a.id, visit: n, ...(by ? { by } : {}) });
    apiRef.current.did(a.id);
    visit.current = { a, n, at: Date.now(), levels: 0, wins: 0, extras: 0 };
    const sheet = 'sheet' in a.kind ? sheetByN(a.kind.sheet) : null;
    const page = sheet ? entryPage(sheet, progress.get()) : null;
    choiceShown.current = page?.kind === 'doors' ? 1 : 0;
    setView({ kind: 'activity', a, n, page });
  };

  /** Every level_end of the activity (turned, left by another page, cut by the flow): what activity_end counts. */
  const counted = (type: string, payload: Record<string, unknown>) => {
    const v = visit.current;
    if (type !== 'level_end' || !v) return;
    v.levels++;
    if (payload.outcome !== 'win') return;
    v.wins++;
    // voluntary extras: the pages behind a door and the boss, solved
    if (payload.page === 'extra' || payload.page === 'boss') v.extras++;
  };
  /** The child turned a page (or a probe's page ended): the time may run out here. */
  const levelEnded = (_end?: LevelEnd) => {
    if (due.current != null) finish();
  };

  // the sheet's pages move by the hash: follow them inside the activity; anything else is the way out
  useEffect(() => {
    if (view.kind !== 'activity' || !('sheet' in view.a.kind)) return;
    const n = view.a.kind.sheet;
    setHashConsumer((hash) => {
      if (finished.current) return;
      const r = parseRoute(hash);
      const cur = viewRef.current;
      const was = cur.kind === 'activity' ? cur.page : null;
      // after the challenge (its next page is the map) and after an extra page (its next is the same door's next page): "¿Cómo seguís?" again
      const backToChoice = (was?.kind === 'boss' && (r.screen !== 'sheet' || r.n !== n))
        || (was?.kind === 'extra' && r.screen === 'sheet' && r.n === n && r.page.kind === 'extra' && r.page.door === was.door && r.page.i === was.i + 1);
      if (!backToChoice && (r.screen !== 'sheet' || r.n !== n)) { toMenu('done'); return; }
      // the time ran out: moving to another page is where it ends
      if (due.current != null) { finish(); return; }
      if (cur.kind !== 'activity') return;
      if (backToChoice) { choiceShown.current++; setView({ ...cur, page: { kind: 'doors' } }); return; }
      if (r.screen !== 'sheet') return;
      if (r.page.kind === 'doors') choiceShown.current++;
      if (r.page.kind === 'extra' && (was?.kind !== 'extra' || was.door !== r.page.door)) log('choice', { activity: cur.a.id, door: r.page.door, sheet: n });
      setView({ ...cur, page: r.page });
    });
    return () => setHashConsumer(null);
    // one consumer per visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.kind === 'activity' ? view.n : -1]);

  // the time
  useEffect(() => {
    const check = () => {
      if (finished.current) return;
      const cur = viewRef.current;
      const levelOpen = cur.kind === 'activity' && ('sheet' in cur.a.kind ? levelsOpen.current > 0 : true);
      // "¿Cómo seguís?" is a menu too: the time ends there at once
      const onMenu = cur.kind === 'menu' || (cur.kind === 'activity' && cur.page?.kind === 'doors');
      const verdict = budgetVerdict({ now: Date.now(), startedAt: startedAt.current, budget, onMenu, levelOpen, dueSince: due.current });
      if (verdict === 'wait') return;
      due.current ??= Date.now();
      if (verdict === 'now') finish();
    };
    check();
    const id = setInterval(check, TICK_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget, view.kind, view.kind === 'activity' ? view.page?.kind : null]);

  // the flow moved on (the adult skipped the step or ended the session): the open activity ends where it was
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => closeVisit('left'), []);

  // the adult menu opens a probe (any grade): the open activity is left for it
  useEffect(() => {
    const on = (e: Event) => {
      const a = activityFor((e as CustomEvent<ProbeId>).detail, grade);
      if (!a || finished.current) return;
      if (viewRef.current.kind === 'activity') {
        if (viewRef.current.a.id === a.id) return;
        leaving.current = 'menu';
        setView({ kind: 'menu', n: visits.current });
      }
      window.setTimeout(() => { if (viewRef.current.kind === 'menu') pick(a, 'adult'); }, 60);
    };
    window.addEventListener(OPEN_PROBE_EVENT, on);
    return () => window.removeEventListener(OPEN_PROBE_EVENT, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __freePlay: unknown }).__freePlay = {
      view: () => viewRef.current,
      /** Screenshots and checks: the time left (ms from now). */
      budget: (msFromNow: number) => { startedAt.current = Date.now(); due.current = null; setBudget(Math.max(0, msFromNow)); },
      pick: (id: string) => { const a = menu.find((x) => x.id === id); if (a) pick(a); },
      menu: () => menu.map((a) => a.id),
      /** Screenshots and checks: the open sheet's core pages solved (so "¿Cómo seguís?" opens its doors). */
      solveCores: () => {
        const cur = viewRef.current;
        const sheet = cur.kind === 'activity' && 'sheet' in cur.a.kind ? sheetByN(cur.a.kind.sheet) : null;
        if (sheet) progress.update((q) => sheet.core.reduce((acc, _, i) => solve(acc, coreId(sheet, i + 1)), q));
      },
    };
  });

  // the sheet's level pages, instrumented (one wrap per visit, so a page is never remounted by it)
  const pageRef = useRef<Record<string, unknown>>({});
  if (view.kind === 'activity' && 'sheet' in view.a.kind) pageRef.current = pageInfo(view.a.kind.sheet, view.page);
  const activityId = view.kind === 'activity' ? view.a.id : '';
  const Wrap = useMemo<LevelWrap>(() => function FreePlayPage({ level, children }: { level: LevelDef; children: ReactNode }) {
    const [extra] = useState(() => pageRef.current);
    useEffect(() => { levelsOpen.current++; return () => { levelsOpen.current--; }; }, []);
    return <InstrumentedPage level={level} activity={activityId} extra={extra} onEnd={levelEnded} listen={counted}>{children}</InstrumentedPage>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId, view.kind === 'activity' ? view.n : -1]);

  if (view.kind === 'over') {
    return <Cheer line={MENU_LINES.over} say={MENU_LINES.over} done={api.next} />;
  }
  if (view.kind === 'menu') {
    return <Menu key={view.n} cards={menu} first={view.n === 0} onPick={pick} />;
  }

  const a = view.a;
  let body: ReactNode;
  if ('sheet' in a.kind && view.page?.kind === 'doors') {
    // round 2: the year's three doors are "¿Cómo seguís?"
    body = <NextChoice key={`choice-${view.n}-${choiceShown.current}`} sheet={sheetByN(a.kind.sheet)!} n={choiceShown.current} onMenu={() => toMenu('menu')} />;
  } else if ('sheet' in a.kind) {
    body = view.page && (
      <LevelWrapContext.Provider value={Wrap}>
        <SheetProgress n={a.kind.sheet} page={view.page}>
          <SheetScreen key={JSON.stringify(view.page)} n={a.kind.sheet} page={view.page} />
        </SheetProgress>
      </LevelWrapContext.Provider>
    );
  } else if ('rules' in a.kind) {
    body = <RuleGame key={view.n} levelEnded={levelEnded} listen={counted} done={() => toMenu('done')} />;
  } else {
    const Probe = PROBES[a.kind.probe];
    body = Probe ? <Probe key={view.n} activity={a.kind.probe} levelEnded={(end) => { counted('level_end', end); levelEnded(end); }} done={() => toMenu('done')} /> : null;
  }
  return (
    <ActivityFrame id={a.id} page={view.page} back={() => toMenu('menu')}>{body}</ActivityFrame>
  );
}

/**
 * An activity on screen, and the drawn way back to the menu: in the page's
 * own bar, just before ✋ (every page of the year has one), so it never
 * covers the palette, the board or the page's next-page button; a page
 * without a bar gets it in the bottom-left corner.
 */
function ActivityFrame({ id, page, back, children }: { id: string; page: SheetPage | null; back: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<Element | null>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const find = () => setBar((b) => { const el = root.querySelector('.level-bar'); return el === b ? b : el; });
    find();
    const mo = new MutationObserver(find);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  const button = (
    <button type="button" className={`pp-menu-back cut${bar ? ' in-bar' : ''}`} aria-label="Volver al menú" onClick={back}><MenuBackArt /></button>
  );
  return (
    <div ref={ref} className="pp-fp-activity" data-activity={id} data-page={page ? JSON.stringify(page) : undefined}>
      {children}
      {bar ? createPortal(button, bar) : button}
    </div>
  );
}

/** A sheet page's progress in the bar: its core pages as stones (the solved ones with a seed), or the way chosen on "¿Cómo seguís?". */
function SheetProgress({ n, page, children }: { n: number; page: SheetPage; children: ReactNode }) {
  const p = useProgress();
  const sheet = sheetByN(n);
  let value: BarProgress = null;
  if (sheet && page.kind === 'core') value = { kind: 'dots', done: sheet.core.map((_, i) => !!p.solved[coreId(sheet, i + 1)]), here: page.k - 1 };
  else if (page.kind === 'extra') value = { kind: 'path', door: page.door };
  else if (page.kind === 'boss') value = { kind: 'path', door: 'boss' };
  return <BarProgressContext.Provider value={value}>{children}</BarProgressContext.Provider>;
}

// ------------------------------------------------------------------ the menu

function MenuTask() {
  return (
    <span className="drawn-task" aria-hidden="true">
      <PlayerFace className="bar-face" />
      <ThenArrow />
      <span className="pp-menu-task"><MenuBackArt /></span>
    </span>
  );
}

function Menu({ cards, first, onPick }: { cards: Activity[]; first: boolean; onPick: (a: Activity) => void }) {
  const rootRef = useRef<HTMLElement>(null);
  const ghost = useGhost(rootRef);
  const [lit, setLit] = useState<string | null>(null);
  const held = useRef<{ id: string; t: number; fired: boolean } | null>(null);
  const all = [first ? MENU_LINES.first : MENU_LINES.again, ...cards.map((c) => c.say)].join(' ');

  // said when it opens: the question, then each card's name while it glows
  useEffect(() => {
    let off = () => {};
    const timers: number[] = [];
    const t = window.setTimeout(() => {
      off = speakWhenAllowed(all);
      // about 62 ms a letter, after the question
      let at = (first ? MENU_LINES.first : MENU_LINES.again).length * 62;
      for (const c of cards) {
        timers.push(window.setTimeout(() => setLit(c.id), at));
        at += c.say.length * 62;
      }
      timers.push(window.setTimeout(() => setLit(null), at));
    }, 450);
    return () => { clearTimeout(t); timers.forEach(clearTimeout); off(); };
    // once per menu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const down = (a: Activity) => {
    const h = { id: a.id, t: window.setTimeout(() => { h.fired = true; setLit(a.id); speak(a.say); }, HOLD_MS), fired: false };
    held.current = h;
  };
  const up = () => { if (held.current) clearTimeout(held.current.t); };
  const click = (a: Activity) => {
    const h = held.current;
    held.current = null;
    // a long press said the name: it does not pick
    if (h?.id === a.id && h.fired) return;
    onPick(a);
  };

  return (
    <main ref={rootRef} className="level mode-freeplay pp-menu" data-menu={cards.map((c) => c.id).join(' ')}>
      <Bar
        instruction={<MenuTask />}
        title={<b>Juego libre</b>}
        pages={null}
        aside={<SeedPouch />}
        onSpeak={() => speak(all)}
        onHelp={() => { ghost([{ do: 'point', at: ['.pp-fp-card'] }]); }}
      />
      <section className="pp-menu-stage" aria-label="Elegí un juego">
        <div className={`sheet pp-menu-sheet n${cards.length}`}>
          <span className="tape tape-l" aria-hidden="true" />
          <span className="tape tape-r" aria-hidden="true" />
          <ul className="pp-fp-cards">
            {cards.map((c, i) => (
              <li key={c.id} style={{ '--tilt': `${[-1.5, 1.2, -0.8, 1.6][i % 4]}deg` } as CSSProperties}>
                <button
                  type="button" className={`pp-fp-card cut${lit === c.id ? ' is-lit' : ''}`} data-activity={c.id} aria-label={c.say}
                  onPointerDown={() => down(c)} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} onClick={() => click(c)}
                >
                  <ActivityArt a={c} />
                  <span className="pp-fp-caption" aria-hidden="true">{c.caption}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

// ------------------------------------------------------------------ the rule game

/** 3ro's two rule-game pages, then the child's own game (FREE_RULES); a page already solved is skipped. */
function RuleGame({ levelEnded, listen, done }: { levelEnded: (end: LevelEnd) => void; listen: (type: string, payload: Record<string, unknown>) => void; done: () => void }) {
  const [i, setI] = useState(() => {
    const p = progress.get();
    const k = RULE_GAME_PAGES.findIndex((id) => !p.solved[id]);
    return k >= 0 ? k : RULE_GAME_PAGES.length - 1;
  });
  const [walk, setWalk] = useState(0);
  if (walk) return <WalkOn key={walk} seed={60 + walk} line="¡Otro juego!" done={() => setWalk(0)} />;
  const id = RULE_GAME_PAGES[i];
  const level = pilotLevel(id)!;
  return (
    <PlaytestLevel
      key={`${id}-${i}`}
      level={level}
      activity="rule_game"
      extra={{ page: id === RULE_GAME_PAGES[RULE_GAME_PAGES.length - 1] ? 'free' : 'core' }}
      autoNextMs={8000}
      listen={listen}
      onEnd={(end) => {
        levelEnded(end);
        if (end.outcome !== 'win') return;
        if (i + 1 < RULE_GAME_PAGES.length) { setI(i + 1); setWalk((w) => w + 1); } else done();
      }}
    />
  );
}
