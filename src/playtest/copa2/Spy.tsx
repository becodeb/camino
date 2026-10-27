// Copa v2 (C10): "Espiá el programa del zorro". After a LOSS the child can look
// at the rival's program, read-only, and answer one question by tapping a
// block: "¿Dónde está el truco?". The answer is told either way (the right block
// turns green), then the rival's run is played with its executing block
// glowing, and "¡A tu taller!" goes back to the garage. This is the "predict /
// read" step of the design: nothing is typed, nothing is lost, a wrong tap only
// shows where the trick was.
//
// Logged: `garage_spy { track, rival, tapped_block_kind, correct }` (docs/prueba-piloto-datos.md).

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CritterId } from '../../curriculum/motivation';
import { speak } from '../../ui/speech';
import { CritterArt } from '../../ui/critterArt';
import { CritterDriver } from '../raceArt';
import { NAME } from '../Race';
import { findBlock } from './program';
import { simulate } from './sim';
import { PALETTES, rivalTargets, type Tier, type TrackSpec } from './tracks';
import { RIVAL_ANIMAL } from './rivals';
import { spiedProgram, trickIds } from './journey';
import { ancestorsOf, type Caret } from './editor';
import { stateAt } from './playback';
import { NO_LIVE, ProgramPanel, type Live, type PanelHandlers } from './ProgramPanel';
import { CAM_MIN, COAST_U, PARK_U, RUN_W, Scene, camFor, courseFor, maybePuddles, previewWidth, uOfPos, type KartLook } from './Scene';
import { seconds } from './labels';
import '../playtest.css';
import '../race.css';
import './garage.css';

const RACE_SPEED = 1.4;
const FINISH_HOLD_MS = 900;

/** What the trick of each copa is, said to the child once they tapped. */
export const TRICK_TEXT: Readonly<Record<number, string>> = {
  1: 'Salta el charco: así no patina ni pierde tiempo.',
  2: 'Usa «repetir»: así toda la pista entra en la memoria.',
  3: 'Mira con «si hay charco adelante» antes de decidir.',
  4: 'Tiene un segundo programa: cuando cae un tronco, frena y espera.',
  5: 'Usa el turbo en las rectas mientras le quedan nitros.',
};
/** What to tell after the tap: the fox's trick is the copa's concept; the coatí's and the carpincho's programs are simpler. */
export function trickText(copa: number, tier: Tier): string {
  if (tier === 'gold') return TRICK_TEXT[copa] ?? 'Este es el bloque que lo hace ganar.';
  if (tier === 'silver') return 'Salta para no patinar en los charcos: eso le ahorra tiempo.';
  return 'No salta los charcos: patina, y por eso llega más lento.';
}

type Phase = 'pick' | 'told' | 'watch' | 'done';

const NO_HANDLERS: PanelHandlers = { onSelect() {}, onCaret() {}, onBump() {}, onLaps() {}, onSensor() {}, onAddEvent() {} };
const CARET: Caret = { script: 'main', path: [], index: 0 };

export interface SpyProps {
  track: TrackSpec;
  /** The rival whose program it is: the one the child lost to. */
  tier: Tier;
  logger?(type: string, payload: Record<string, unknown>): void;
  onDone(): void;
  onPhase?(busy: boolean): void;
  headerExtra?: ReactNode;
}

export function Spy({ track, tier, logger, onDone, onPhase, headerExtra }: SpyProps) {
  const animal: CritterId = RIVAL_ANIMAL[tier];
  const name = NAME[animal];
  const program = useMemo(() => spiedProgram(track, tier), [track, tier]);
  const answers = useMemo(() => trickIds(track, tier), [track, tier]);
  const rules = useMemo(() => ({ palette: PALETTES[track.copa], slots: track.slots }), [track]);
  const sim = useMemo(() => simulate(program, track, 1), [program, track]);
  const { course, road, total } = useMemo(() => courseFor(track, track.laps), [track]);
  const lapTiles = track.tiles.length;
  const movingPuddles = !('fixed' in track.puddles);
  const [phase, setPhase] = useState<Phase>('pick');
  const [tapped, setTapped] = useState<string | null>(null);
  const [clock, setClock] = useState(0);
  const [over, setOver] = useState(false);
  const told = useRef(false);

  useEffect(() => { onPhase?.(phase === 'watch'); }, [phase, onPhase]);
  // the question is already on screen, large (the caption bubble is hidden on these pages, flow.css)
  useEffect(() => {
    speak(`Espiá el programa ${name.startsWith('el ') ? `del ${name.slice(3)}` : `de ${name}`}. ¿Dónde está el truco? Tocá el bloque.`);
  }, [name]);

  const correct = tapped != null && answers.includes(tapped);
  const answerId = phase === 'pick' ? null : answers.includes(tapped ?? '') ? tapped : answers[0];

  const pick = (id: string) => {
    if (phase !== 'pick' || told.current) return;
    told.current = true;
    const ok = answers.includes(id);
    const kind = findBlock(program, id)?.kind ?? 'unknown';
    logger?.('garage_spy', { track: track.id, rival: tier, tapped_block_kind: kind, correct: ok });
    setTapped(id);
    setPhase('told');
    speak(ok ? `¡Sí! ${trickText(track.copa, tier)}` : `Casi. El truco está en el bloque verde. ${trickText(track.copa, tier)}`);
  };

  // the rival's run, played at the garage's speed
  useEffect(() => {
    if (phase !== 'watch') return;
    const t0 = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const real = now - t0;
      setClock(real);
      if (real * RACE_SPEED >= sim.timeMs + FINISH_HOLD_MS * RACE_SPEED) { cancelAnimationFrame(raf); setOver(true); setPhase('done'); }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, sim]);

  // the scene: parked at the line while the child reads, then the run
  let me: KartLook = { u: PARK_U.me, revving: true };
  let viewW = previewWidth(1 + lapTiles);
  let cam = CAM_MIN;
  let live: Live = NO_LIVE;
  let logs = [] as ReturnType<typeof stateAt>['logs'];
  let puddles: { real: readonly number[] } | { maybe: readonly number[] } = movingPuddles ? { maybe: maybePuddles(track) } : { real: 'fixed' in track.puddles ? track.puddles.fixed : [] };
  const watching = phase === 'watch' || phase === 'done';
  if (watching) {
    const tNow = phase === 'done' ? sim.timeMs + 200 : Math.min(clock * RACE_SPEED, sim.timeMs + 600);
    const s = stateAt(sim, tNow);
    const coast = tNow > sim.timeMs ? Math.min(COAST_U, (tNow - sim.timeMs) / 600) : 0;
    const u = uOfPos(s.pos + coast);
    me = { u, lift: s.lift, turbo: s.turbo, skidding: s.skidding, sputter: s.sputter, crashed: s.crashed, braking: s.braking };
    viewW = RUN_W;
    cam = camFor(u, RUN_W, 1 + total);
    puddles = { real: sim.puddles };
    logs = s.logs;
    live = s.blockId && phase === 'watch' ? { leaf: s.blockId, around: new Set(ancestorsOf(program, s.blockId)) } : NO_LIVE;
  }

  const goal = (
    <div className="gx-goal gx-goal-spy">
      <span className="gx-goal-critter"><svg viewBox="-60 -90 120 100" width="64" height="54" aria-hidden="true"><CritterArt id={animal} bare /></svg></span>
      <span className="gx-goal-text">{phase === 'pick' ? <><b>¿Dónde está el truco?</b> Tocá el bloque</> : phase === 'told' ? <>Así ganó {name}</> : <>Mirá cómo corre {name}</>}</span>
    </div>
  );

  return (
    <main className="gx-page gx-spy-page" data-phase={phase === 'watch' ? 'run' : 'garage'} data-spy={phase} data-track={track.id}>
      <header className="gx-head">
        <div className="gx-title">
          <div className="gx-title-row"><small>Copa {track.copa}</small>{headerExtra}</div>
          <h1>Espiá el programa {name.startsWith('el ') ? `del ${name.slice(3)}` : `de ${name}`}</h1>
        </div>
        {goal}
      </header>

      <section className="sheet gx-scene-card">
        <Scene
          course={course} road={road} lapTiles={lapTiles} viewW={viewW} cam={cam} me={me}
          rivals={[{ u: -50 }, { u: -50 }]} pair={[animal, animal]} puddles={puddles} logs={logs} numbers={!watching} spinKey={0}
          meDriver={<CritterDriver id={animal} />} hideRivals
        />
        {watching && (
          <div className="gx-hud" aria-live="off"><span className="gx-clock">{seconds(Math.min(clock * RACE_SPEED, sim.timeMs))}</span></div>
        )}
      </section>

      <div className="gx-body is-nopal">
        <div className="gx-main">
          <ProgramPanel
            program={program} rules={rules} caret={CARET} selected={null} live={live} crashId={null} wrongId={null} readOnly
            handlers={NO_HANDLERS} pick={phase === 'pick' ? pick : undefined} answerId={answerId}
            title={`Programa ${name.startsWith('el ') ? `del ${name.slice(3)}` : `de ${name}`}`}
          />
        </div>
        <aside className="gx-side gx-spy-side">
          {phase === 'pick' && (
            <section className="sheet gx-spy-card">
              <p className="gx-spy-big">¿Dónde está el truco?</p>
              <p className="gx-spy-sub">Este es el programa {name.startsWith('el ') ? `del ${name.slice(3)}` : `de ${name}`}. Tocá el bloque que lo hace ganar.</p>
            </section>
          )}
          {phase === 'told' && (
            <section className="sheet gx-spy-card" role="status" data-correct={correct ? 1 : 0}>
              <p className={`gx-spy-big ${correct ? 'is-ok' : 'is-near'}`}>{correct ? '¡Sí, ahí está!' : 'Casi. Mirá el bloque verde.'}</p>
              <p className="gx-spy-sub">{trickText(track.copa, tier)}</p>
              <p className="gx-spy-target">Su programa llega en <b>{seconds(rivalTargets(track)[tier])}</b>.</p>
              <button type="button" className="cut gx-spy-go" data-act="spy-watch" onClick={() => { setClock(0); setPhase('watch'); }}>¡Mirá cómo corre!</button>
            </section>
          )}
          {phase === 'watch' && (
            <section className="sheet gx-runbox" aria-live="polite">
              <p className="gx-run-title">¡Allá va {name.startsWith('el ') ? `el ${name.slice(3)}` : name}!</p>
              <p className="gx-run-sub">Mirá qué bloque está andando: se ilumina.</p>
            </section>
          )}
          {phase === 'done' && (
            <section className="sheet gx-spy-card" role="status">
              <p className="gx-spy-big">{over && sim.outcome === 'finish' ? `Llegó en ${seconds(sim.timeMs)}` : 'Listo'}</p>
              <p className="gx-spy-sub">Ahora probalo en tu programa.</p>
              <button type="button" className="cut gx-spy-go" data-act="spy-done" onClick={onDone}>¡A tu taller!</button>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
