// The dev drawer: for the adult who shows or tests the demo. A small dark
// "dev" tab in the corner (never one of the child's three controls), the `
// key or typing d-e-v, or `?dev` in the URL. While dev mode is on nothing is
// blocked; the drawer jumps to any sheet and any level (core, a door's extra,
// the boss), marks the level solved, skips to the next page, sets the sheet
// the teacher opened, grants seeds, resets the progress, and shows the
// level's id and its generator seed.

import { useEffect, useState } from 'react';
import { DOORS, DOOR_LABEL, isBuilt, type Door } from '../curriculum/model';
import { PRIMER, sheetByN } from '../curriculum/primer';
import { earnGold, grant, openSheet, progress, sheetState, solve, useProgress } from '../curriculum/progress';
import { extraFor } from '../curriculum/generate';
import { MAP_HREF, currentSheet, goldPage, isGold, levelIdOf, nextExtra, nextHref, plainPage, sheetHref, type Route } from '../curriculum/route';
import { formatOf } from '../game/formats';
import { levelOf } from './SheetScreen';
import { levelById } from '../game/levels';
import { stamp } from '../game/progress';
import { devMode, useDev } from '../ui/devMode';
import { goNext } from './levelKit';

/** The ` key toggles the drawer; so does typing "dev" (for keyboards where ` is a dead key). */
function useDevKeys() {
  useEffect(() => {
    let typed = '';
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.code === 'Backquote' || e.key === '`') { e.preventDefault(); devMode.toggle(); return; }
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      typed = (typed + e.key.toLowerCase()).slice(-3);
      if (typed === 'dev') { typed = ''; devMode.toggle(); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
}

function where(route: Route): string {
  if (route.screen === 'home') return 'inicio (el tramo de la demo)';
  if (route.screen === 'map') return 'el mapa de 1ro';
  if (route.screen === 'level') return `demo: ${levelById(route.id)?.title ?? route.id}`;
  const s = sheetByN(route.n)!;
  const pg = route.page;
  const part = pg.kind === 'core' ? `núcleo ${pg.k}` : pg.kind === 'extra' ? `puerta ${DOOR_LABEL[pg.door]} ${pg.i}` : pg.kind === 'boss' ? 'jefe' : pg.kind === 'doors' ? 'puertas' : 'entrada';
  return `hoja ${s.n} · ${s.title} · ${isBuilt(s) ? part : 'próximamente'}${isGold(pg) ? ' · sello dorado' : ''}`;
}

/** The format of a page, for the adult (small print). */
const FORMAT_LABEL = { solve: 'armar', complete: 'completar', fix: 'arreglar', predict: 'predecir' } as const;

export function DevDrawer({ route }: { route: Route }) {
  const dev = useDev();
  const p = useProgress();
  const [confirm, setConfirm] = useState(false);
  const [index, setIndex] = useState<Record<Door, number>>({ easy: 1, medium: 1, hard: 1 });
  useDevKeys();

  const sheet = route.screen === 'sheet' ? sheetByN(route.n)! : currentSheet(p);
  const n = sheet.n;
  // the extras' indices follow the sheet: each door starts at its first unsolved extra
  useEffect(() => {
    const s = sheetByN(n)!;
    setIndex({ easy: nextExtra(s, 'easy', progress.get()), medium: nextExtra(s, 'medium', progress.get()), hard: nextExtra(s, 'hard', progress.get()) });
  }, [n]);
  useEffect(() => { if (!dev.open) setConfirm(false); }, [dev.open]);

  if (!dev.on) return <button type="button" className="dev-tab" onClick={devMode.toggle} title="Modo dev (para adultos): tecla `">dev</button>;
  if (!dev.open) return <button type="button" className="dev-tab is-on" onClick={devMode.toggle} title="Abrir el cajón dev">dev ▴</button>;

  const onSheet = route.screen === 'sheet' && isBuilt(sheet) ? route : null;
  const levelId = onSheet ? levelIdOf(sheet, onSheet.page) : route.screen === 'level' ? route.id : null;
  const extra = onSheet?.page.kind === 'extra' ? extraFor(sheet, onSheet.page.door, onSheet.page.i) : null;
  const here = onSheet ? levelOf(sheet, plainPage(onSheet.page)) : null;
  const onGold = !!onSheet && isGold(onSheet.page);
  const st = sheetState(sheet, p);

  const markSolved = () => {
    if (!levelId) return;
    if (route.screen === 'level') stamp(levelId);
    else if (onGold) progress.update((x) => earnGold(x, levelId));
    else progress.update((x) => solve(x, levelId));
  };
  const skip = () => {
    if (onSheet) location.hash = nextHref(sheet, onSheet.page);
    else if (route.screen === 'level') { const l = levelById(route.id); if (l) goNext(l); }
  };
  const reset = () => {
    if (!confirm) { setConfirm(true); return; }
    progress.reset();
    setConfirm(false);
  };

  return (
    <aside className="dev-drawer" aria-label="Cajón dev">
      <header className="dev-head">
        <b>modo dev</b>
        <span className="dev-sub">nada bloqueado</span>
        <button type="button" onClick={devMode.toggle} title="Plegar (sigue en modo dev)">▾</button>
        <button type="button" onClick={devMode.off} title="Salir del modo dev">apagar</button>
      </header>

      <section className="dev-sec">
        <p className="dev-where">{where(route)}</p>
        <p className="dev-id">
          nivel <code data-dev="level-id">{levelId ?? '—'}</code> · semilla <code data-dev="seed">{extra?.seed ?? '—'}</code>
          {here && <> · <span data-dev="format">{FORMAT_LABEL[formatOf(here)]}{here.save ? ' + oro' : ''}</span></>}
        </p>
        <div className="dev-row">
          <button type="button" onClick={markSolved} disabled={!levelId || (route.screen === 'sheet' && !!(onGold ? p.gold[levelId] : p.solved[levelId]))}>{onGold ? 'marcar oro' : 'marcar resuelto'}</button>
          <button type="button" onClick={skip} disabled={!onSheet && route.screen !== 'level'}>saltar ▸</button>
          {onSheet && here?.save && !onGold && <a href={sheetHref(n, goldPage(onSheet.page))} data-dev-gold>sello dorado</a>}
        </div>
      </section>

      <section className="dev-sec">
        <h2>hojas</h2>
        <div className="dev-sheets">
          {PRIMER.map((s) => (
            <a key={s.n} href={sheetHref(s.n)} className={`${isBuilt(s) ? 'is-built' : ''}${s.n === n ? ' is-sel' : ''}${sheetState(s, p).complete ? ' is-done' : ''}`} title={s.title} data-dev-sheet={s.n}>{s.n}</a>
          ))}
        </div>
        {isBuilt(sheet) ? (
          <>
            <div className="dev-row">
              <span className="dev-label">hoja {n}:</span>
              {sheet.core.map((c, i) => <a key={i} href={sheetHref(n, { kind: 'core', k: i + 1 })} data-dev-core={i + 1} title={c.level.title}>{i + 1}{c.essential ? '•' : ''}</a>)}
              <a href={sheetHref(n, { kind: 'doors' })}>puertas</a>
              {sheet.boss && <a href={sheetHref(n, { kind: 'boss' })} data-dev-boss>jefe</a>}
            </div>
            {DOORS.map((d) => (
              <div key={d} className="dev-row">
                <span className="dev-label">{DOOR_LABEL[d]}</span>
                <button type="button" onClick={() => setIndex((x) => ({ ...x, [d]: Math.max(1, x[d] - 1) }))} aria-label="anterior">−</button>
                <b className="dev-n">{index[d]}</b>
                <button type="button" onClick={() => setIndex((x) => ({ ...x, [d]: x[d] + 1 }))} aria-label="siguiente">+</button>
                <a href={sheetHref(n, { kind: 'extra', door: d, i: index[d] })} data-dev-door={d}>ir</a>
                <span className="dev-small">{st.extras[d]} resueltos</span>
              </div>
            ))}
          </>
        ) : <p className="dev-small">La hoja {n} todavía no está armada ({sheet.builtIn}).</p>}
      </section>

      <section className="dev-sec">
        <div className="dev-row">
          <span className="dev-label">la maestra abrió hasta la hoja</span>
          <button type="button" onClick={() => progress.update((x) => openSheet(x, x.opened - 1))} aria-label="una menos">−</button>
          <b className="dev-n" data-dev="opened">{p.opened}</b>
          <button type="button" onClick={() => progress.update((x) => openSheet(x, x.opened + 1))} aria-label="una más">+</button>
        </div>
        <div className="dev-row">
          <span className="dev-label">semillas</span>
          <b className="dev-n" data-dev="seeds">{p.seeds}</b>
          <button type="button" onClick={() => progress.update((x) => grant(x, 1))}>+1</button>
          <button type="button" onClick={() => progress.update((x) => grant(x, 5))}>+5</button>
          <button type="button" onClick={() => progress.update((x) => grant(x, -5))}>−5</button>
        </div>
      </section>

      <section className="dev-sec dev-foot">
        <button type="button" className={`dev-danger${confirm ? ' is-armed' : ''}`} onClick={reset}>{confirm ? '¿seguro? tocá otra vez' : 'borrar el progreso'}</button>
        <a href={MAP_HREF}>mapa</a>
        <a href="#/">inicio</a>
      </section>
    </aside>
  );
}
