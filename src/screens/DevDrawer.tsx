// The dev drawer: for the adult who shows or tests the demo. A small dark
// "dev" tab in the corner (never one of the child's three controls), the `
// key or typing d-e-v, or `?dev` in the URL. While dev mode is on nothing is
// blocked; the drawer jumps to any sheet and any level (core, a door's extra,
// the boss), marks the level solved, skips to the next page, sets the sheet
// the teacher opened, grants seeds, resets the progress, and shows the
// level's id and its generator seed. On a workshop it opens the editor, the
// test page and the corkboard, pins the level being made without playing it,
// and clears the levels made on this device; on the comodín it opens its
// three choices; on the showcase its four steps (and picks three pages). The
// motivation layer: the character, the wardrobe's switch (the teacher opens
// it at the end of a class; dev mode always may), pieces and critters given
// before their milestones, the garden previewed with 0, 10, 50 or 150 seeds,
// a sheet's preview card shown again, the fitting room.

import { useEffect, useState } from 'react';
import { DOORS, DOOR_LABEL, goalId, hasCore, isBuilt, type Door, type HubGoal, type Sheet } from '../curriculum/model';
import { PRESETS, PRESET_IDS, type PresetId } from '../curriculum/presets';
import { PRIMER, sheetByN } from '../curriculum/primer';
import { chooseCharacter, clearMade, earnGold, grant, grantCritter, grantItem, openSheet, played, progress, publish, reachGoal, setWardrobe, sheetState, solve, useProgress } from '../curriculum/progress';
import { CHARACTER_IDS, CHARACTER_NAME, CRITTER_IDS, ITEMS, critterReward } from '../curriculum/motivation';
import { arrivedCritters, isUnlocked, unlockSay } from '../curriculum/rewards';
import { extraFor } from '../curriculum/generate';
import { GARDEN_HREF, MAP_HREF, SHOWCASE, WARDROBE_HREF, currentSheet, goldPage, isGold, levelIdOf, nextExtra, nextHref, plainPage, sheetHref, type Route, type SheetPage } from '../curriculum/route';
import { cardLevelId, draftFor, nextMadeId, verdictOf } from '../curriculum/workshop';
import { showPages } from '../curriculum/showcase';
import { formatOf } from '../game/formats';
import { levelOf } from './SheetScreen';
import { levelById } from '../game/levels';
import { stamp } from '../game/progress';
import { devKeyListener, devMode, useDev } from '../ui/devMode';
import { goNext } from './levelKit';
import { previewCard } from './PreviewCard';

/** The ` key toggles the drawer; so does typing "dev" (ui/devMode.ts: never in a playtest build without ?debug). */
function useDevKeys() {
  useEffect(() => {
    const on = devKeyListener(() => devMode.toggle());
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
}

function partOf(pg: SheetPage): string {
  switch (pg.kind) {
    case 'core': return `núcleo ${pg.k}`;
    case 'extra': return `puerta ${DOOR_LABEL[pg.door]} ${pg.i}`;
    case 'boss': return 'jefe';
    case 'doors': return 'puertas';
    case 'entry': return 'entrada';
    case 'taller': return 'taller (el editor)';
    case 'probar': return 'taller, a prueba';
    case 'cartelera': return 'cartelera';
    case 'tarjeta': return `cartelera · tarjeta ${pg.card}`;
    case 'comodin': return 'las tres opciones';
    case 'recuperar': return 'recuperar (el puente)';
    case 'pendiente': return `recuperar · hoja ${pg.n}, página ${pg.k}`;
    case 'repaso': return `repaso · hoja ${pg.n}, puerta fácil ${pg.i}`;
    case 'musica': return 'música libre (hoja 9, página 4)';
    case 'personaje': return 'elegir personaje';
    case 'muestra': return 'los pasos de la muestra';
    case 'elegir': return 'elegir las páginas para mostrar';
    case 'familia': return `la familia juega (página ${pg.i})`;
    case 'recorrido': return 'recorrido por el jardín';
    case 'afiche': return 'el afiche del año';
  }
}

function where(route: Route): string {
  if (route.screen === 'home') return 'inicio (el tramo de la demo)';
  if (route.screen === 'map') return 'el mapa de 1ro';
  if (route.screen === 'level') return `demo: ${levelById(route.id)?.title ?? route.id}`;
  if (route.screen === 'garden') return route.seeds != null ? `el jardín (vista de prueba con ${route.seeds} semillas)` : 'el jardín';
  if (route.screen === 'wardrobe') return 'el vestidor';
  if (route.screen === 'fitting') return 'el probador (cada prenda en cada personaje)';
  if (route.screen === 'piloto') return 'la prueba piloto';
  const s = sheetByN(route.n)!;
  const pg = route.page;
  return `hoja ${s.n} · ${s.title} · ${isBuilt(s) ? partOf(pg) : 'próximamente'}${isGold(pg) ? ' · sello dorado' : ''}`;
}

/** The comodín's page a level of it counts for (its goal), if any. */
const HUB_GOAL: Partial<Record<SheetPage['kind'], HubGoal>> = { pendiente: 'recuperar', repaso: 'recuperar', musica: 'musica', tarjeta: 'companeros' };

/** Pins the level being made in a workshop without playing it (its reference program as the author's). */
function publishDraft(sheet: Sheet) {
  const p = progress.get();
  const d = draftFor(p, sheet);
  const v = verdictOf(d, !!sheet.workshop?.limited);
  if (!v.ok) return;
  const id = nextMadeId(p);
  progress.update((x) => solve(publish(x, { id, sheet: sheet.n, board: d.board, lines: v.lines, solution: v.solution }), cardLevelId(id)));
}

/** The format of a page, for the adult (small print). */
const FORMAT_LABEL = { solve: 'armar', complete: 'completar', fix: 'arreglar', predict: 'predecir' } as const;

export function DevDrawer({ route }: { route: Route }) {
  const dev = useDev();
  const p = useProgress();
  const [confirm, setConfirm] = useState(false);
  const [confirmMade, setConfirmMade] = useState(false);
  const [index, setIndex] = useState<Record<Door, number>>({ easy: 1, medium: 1, hard: 1 });
  useDevKeys();

  const sheet = route.screen === 'sheet' ? sheetByN(route.n)! : currentSheet(p);
  const n = sheet.n;
  // the extras' indices follow the sheet: each door starts at its first unsolved extra
  useEffect(() => {
    const s = sheetByN(n)!;
    setIndex({ easy: nextExtra(s, 'easy', progress.get()), medium: nextExtra(s, 'medium', progress.get()), hard: nextExtra(s, 'hard', progress.get()) });
  }, [n]);
  useEffect(() => { if (!dev.open) { setConfirm(false); setConfirmMade(false); } }, [dev.open]);

  if (!dev.on) return <button type="button" className="dev-tab" onClick={devMode.toggle} title="Modo dev (para adultos): tecla `">dev</button>;
  if (!dev.open) return <button type="button" className="dev-tab is-on" onClick={devMode.toggle} title="Abrir el cajón dev">dev ▴</button>;

  const onSheet = route.screen === 'sheet' && isBuilt(sheet) ? route : null;
  const levelId = onSheet ? levelIdOf(sheet, onSheet.page) : route.screen === 'level' ? route.id : null;
  const extra = onSheet?.page.kind === 'extra' ? extraFor(sheet, onSheet.page.door, onSheet.page.i) : null;
  const here = onSheet ? levelOf(sheet, plainPage(onSheet.page)) : null;
  const onGold = !!onSheet && isGold(onSheet.page);
  const st = sheetState(sheet, p);
  const arrived = arrivedCritters(p);

  const markSolved = () => {
    if (!levelId) return;
    if (route.screen === 'level') { stamp(levelId); return; }
    if (onGold) { progress.update((x) => earnGold(x, levelId)); return; }
    const pg = onSheet?.page;
    const goal = sheet.hub && pg ? HUB_GOAL[pg.kind] : undefined;
    progress.update((x) => {
      let y = solve(x, levelId);
      // a card of the corkboard counts as played (a workshop is done with one classmate's level played)
      if (pg?.kind === 'tarjeta') y = played(y, pg.card);
      return goal ? reachGoal(y, goalId(sheet, goal)) : y;
    });
  };
  /** The showcase: picks the first three pages that can be shown, or clears the picks. */
  const pickThree = () => {
    progress.update((x) => (x.favorites.length ? { ...x, favorites: [] } : { ...x, favorites: showPages(x).slice(0, 3).map((s) => s.id) }));
  };
  const clearLevels = () => {
    if (!confirmMade) { setConfirmMade(true); return; }
    progress.update(clearMade);
    setConfirmMade(false);
  };
  const draftOk = !!sheet.workshop && verdictOf(draftFor(p, sheet), !!sheet.workshop.limited).ok;
  const skip = () => {
    if (onSheet) location.hash = nextHref(sheet, onSheet.page);
    else if (route.screen === 'level') { const l = levelById(route.id); if (l) goNext(l); }
  };
  const reset = () => {
    if (!confirm) { setConfirm(true); return; }
    progress.reset();
    setConfirm(false);
  };
  /** For the adult preparing a school demo: replaces the saved progress with a ready-made state and goes to the map. Dev mode only, so it asks nothing first. */
  const applyPreset = (id: PresetId) => {
    progress.update(() => PRESETS[id].build());
    location.hash = MAP_HREF;
  };

  return (
    <aside className="dev-drawer" aria-label="Cajón dev">
      <header className="dev-head">
        <b>modo dev</b>
        <span className="dev-sub">nada bloqueado</span>
        <button type="button" onClick={devMode.toggle} title="Plegar (sigue en modo dev)">▾</button>
        <button type="button" onClick={devMode.off} title="Salir del modo dev">apagar</button>
      </header>

      <section className="dev-sec" data-dev-presentation>
        <h2>presentación</h2>
        <p className="dev-small">Arma el progreso guardado para mostrar la demo sin jugar el año, y abre el mapa.</p>
        <div className="dev-row">
          {PRESET_IDS.map((id) => (
            <button key={id} type="button" onClick={() => applyPreset(id)} data-dev-preset={id}>{PRESETS[id].label}</button>
          ))}
        </div>
      </section>

      <section className="dev-sec">
        <p className="dev-where">{where(route)}</p>
        <p className="dev-id">
          nivel <code data-dev="level-id">{levelId ?? '—'}</code> · semilla <code data-dev="seed">{extra?.seed ?? '—'}</code>
          {here && <> · <span data-dev="format">{FORMAT_LABEL[formatOf(here)]}{here.save ? ' + oro' : ''}{here.music ? ' · música' : ''}{here.guarda ? ' · guarda' : ''}</span></>}
        </p>
        <div className="dev-row">
          <button type="button" onClick={markSolved} disabled={!levelId || (route.screen === 'sheet' && !!(onGold ? p.gold[levelId] : p.solved[levelId]))}>{onGold ? 'marcar oro' : 'marcar resuelto'}</button>
          <button type="button" onClick={skip} disabled={!onSheet && route.screen !== 'level'}>saltar ▸</button>
          {onSheet && here?.save && !onGold && <a href={sheetHref(n, goldPage(onSheet.page))} data-dev-gold>sello dorado</a>}
          {sheet.preview && <button type="button" onClick={() => previewCard.show(n)} data-dev-preview title={`El adelanto del final de la hoja ${n}`}>ver el adelanto</button>}
        </div>
      </section>

      <section className="dev-sec">
        <h2>hojas</h2>
        <div className="dev-sheets">
          {PRIMER.map((s) => (
            <a key={s.n} href={sheetHref(s.n)} className={`${isBuilt(s) ? 'is-built' : ''}${s.n === n ? ' is-sel' : ''}${sheetState(s, p).complete ? ' is-done' : ''}`} title={s.title} data-dev-sheet={s.n}>{s.n}</a>
          ))}
        </div>
        {sheet.workshop ? (
          <>
            <div className="dev-row">
              <span className="dev-label">hoja {n}:</span>
              <a href={sheetHref(n, { kind: 'taller' })} data-dev-page="taller">taller</a>
              <a href={sheetHref(n, { kind: 'probar' })} data-dev-page="probar">a prueba</a>
              <a href={sheetHref(n, { kind: 'cartelera' })} data-dev-page="cartelera">cartelera</a>
            </div>
            <div className="dev-row">
              <button type="button" onClick={() => publishDraft(sheet)} disabled={!draftOk} data-dev-publish>colgar el nivel sin jugarlo</button>
              <span className="dev-small">{st.published} {st.published === 1 ? 'colgado' : 'colgados'} · {st.playedOthers ? 'jugó uno de un compañero' : 'todavía no jugó uno de un compañero'}</span>
            </div>
          </>
        ) : sheet.showcase ? (
          <>
            <div className="dev-row">
              <span className="dev-label">hoja {n}:</span>
              <a href={sheetHref(n, { kind: 'muestra' })} data-dev-page="muestra">pasos</a>
              <a href={sheetHref(n, { kind: 'elegir' })} data-dev-page="elegir">elegir</a>
              <a href={sheetHref(n, { kind: 'familia', i: 1 })} data-dev-page="familia">familia</a>
              <a href={sheetHref(n, { kind: 'recorrido' })} data-dev-page="recorrido">jardín</a>
              <a href={sheetHref(n, { kind: 'afiche' })} data-dev-page="afiche">afiche</a>
            </div>
            <div className="dev-row">
              <button type="button" onClick={pickThree} disabled={!showPages(p).length} data-dev-pick title="Elige las tres primeras páginas resueltas (o las borra si ya hay)">{p.favorites.length ? 'borrar las elegidas' : 'elegir tres páginas'}</button>
              <span className="dev-small">{p.favorites.length} elegidas · {showPages(p).length} para elegir</span>
            </div>
          </>
        ) : sheet.hub ? (
          <div className="dev-row">
            <span className="dev-label">hoja {n}:</span>
            <a href={sheetHref(n, { kind: 'comodin' })} data-dev-page="comodin">opciones</a>
            <a href={sheetHref(n, { kind: 'recuperar' })} data-dev-page="recuperar">recuperar</a>
            <a href={sheetHref(n, { kind: 'musica' })} data-dev-page="musica">música</a>
            <a href={sheetHref(n, { kind: 'cartelera' })} data-dev-page="cartelera">cartelera</a>
          </div>
        ) : hasCore(sheet) ? (
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
          <span className="dev-label">el docente abrió hasta la hoja</span>
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
        <div className="dev-row">
          <span className="dev-label">niveles hechos en esta compu</span>
          <b className="dev-n" data-dev="made">{p.made.length}</b>
          <button type="button" className={`dev-danger${confirmMade ? ' is-armed' : ''}`} onClick={clearLevels} data-dev-clear-made>{confirmMade ? '¿seguro? tocá otra vez' : 'borrarlos'}</button>
        </div>
      </section>

      <section className="dev-sec" data-dev-motivation>
        <h2>motivación</h2>
        <div className="dev-row">
          <span className="dev-label">personaje</span>
          {CHARACTER_IDS.map((id) => (
            <button key={id} type="button" className={p.character === id ? 'is-sel' : ''} onClick={() => progress.update((x) => chooseCharacter(x, id))} data-dev-character={id}>{CHARACTER_NAME[id]}</button>
          ))}
        </div>
        <div className="dev-row">
          <span className="dev-label">vestidor</span>
          <button type="button" onClick={() => progress.update((x) => setWardrobe(x, !x.wardrobe))} data-dev-wardrobe={p.wardrobe ? 'open' : 'shut'} title="El docente lo abre al final de la clase; en modo dev siempre se puede entrar">
            {p.wardrobe ? 'abierto por el docente · cerrar' : 'cerrado · que lo abra el docente'}
          </button>
          <a href={WARDROBE_HREF}>ir</a>
          <a href="#/probador" title="Cada prenda en cada personaje">probador</a>
          <a href={sheetHref(SHOWCASE)} data-dev-showcase title="La muestra (hoja 17)">muestra</a>
        </div>
        <div className="dev-row">
          <span className="dev-label">jardín</span>
          <a href={GARDEN_HREF} data-dev-garden="mine">el mío</a>
          {[0, 10, 50, 150].map((n) => <a key={n} href={`${GARDEN_HREF}/${n}`} data-dev-garden={n} title={`Vista de prueba con ${n} semillas (no cambia el progreso)`}>con {n}</a>)}
        </div>
        <div className="dev-row">
          <span className="dev-label">dar ropa</span>
          {ITEMS.map((i) => (
            <button key={i.id} type="button" disabled={isUnlocked(i, p)} onClick={() => progress.update((x) => grantItem(x, i.id))} data-dev-item={i.id} title={`${i.name}: ${unlockSay(i.unlock)}`}>{i.id}</button>
          ))}
        </div>
        <div className="dev-row">
          <span className="dev-label">mandar bicho</span>
          {CRITTER_IDS.map((id) => (
            <button key={id} type="button" disabled={arrived.includes(id)} onClick={() => progress.update((x) => grantCritter(x, id))} data-dev-critter={id} title={`${critterReward(id).name} (lo manda el desafío de la hoja ${critterReward(id).sheet})`}>{id}</button>
          ))}
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
