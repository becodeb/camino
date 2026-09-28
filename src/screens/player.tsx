// Who plays: the child's character and what it wears. In 1ro's year it is
// the one the child picked (Brote until then), dressed from the wardrobe; it
// stands on the map, in the garden, in the bar's portrait and walks the
// boards. The demo's tramo keeps Brote. A page can put someone else on the
// board (the showcase's family plays with Brote while the child's character
// cheers).

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { CHARACTERS, type CharacterDef } from '../ink/characters.js';
import type { CharacterId, Outfit } from '../curriculum/motivation';
import { useProgress } from '../curriculum/progress';
import { outfitOf } from '../curriculum/rewards';
import { Portrait } from '../ui/art';
import { drawPortrait } from '../ui/board/BoardView';
import { StageView } from '../ui/board/StageView';

export interface Player { def: CharacterDef; outfit: Outfit }

export const charDef = (id: CharacterId | string): CharacterDef => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
export const BROTE_PLAYER: Player = { def: CHARACTERS[0], outfit: {} };

export const PlayerContext = createContext<Player>(BROTE_PLAYER);
export const usePlayer = () => useContext(PlayerContext);

/** A stable key of a player (for effects that redraw it). */
export const playerKey = (p: Player) => `${p.def.id}:${JSON.stringify(p.outfit)}`;

/** The year's player, from the progress. */
export function useYearPlayer(): Player {
  const p = useProgress();
  const outfit = outfitOf(p);
  const key = `${p.character}:${JSON.stringify(outfit)}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ({ def: charDef(p.character), outfit }), [key]);
}

/** Wraps the year's screens: the child's character plays there. */
export function YearPlayer({ children }: { children: ReactNode }) {
  return <PlayerContext.Provider value={useYearPlayer()}>{children}</PlayerContext.Provider>;
}

/** The player's portrait, dressed (the bar's drawn instruction, the badges). */
export function PlayerFace({ className, mood }: { className?: string; mood?: 'smile' | 'grin' }) {
  const player = usePlayer();
  return <Portrait def={player.def} outfit={player.outfit} className={className} mood={mood} />;
}

/**
 * A living character on its own stage (ui/board/StageView.ts), dressed; it
 * pops in again when the player changes. `box`: the stage's viewBox around
 * its feet.
 */
export function useStage(player: Player, box?: { x: number; y: number; w: number; h: number }, o?: { shadow?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const view = useRef<StageView | null>(null);
  const playerRef = useRef(player);
  playerRef.current = player;
  useEffect(() => {
    const v = new StageView(ref.current!, box, o);
    view.current = v;
    v.show(playerRef.current.def, playerRef.current.outfit);
    return () => { v.destroy(); view.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const key = playerKey(player);
  const shown = useRef(key);
  useEffect(() => {
    if (shown.current === key) return;
    shown.current = key;
    view.current?.show(player.def, player.outfit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { ref, view };
}

/**
 * The player standing in a drawn scene (the map, the bridge of the comodín):
 * a still portrait in a nested <svg> on a hatched shadow, bobbing while it
 * waits. `w`: its size in the scene's units; `look`: where its eyes go.
 */
export function ScenePlayer({ x, y, w = 92, look = { x: -0.25, y: 0.2 }, className = 'map-brote' }: { x: number; y: number; w?: number; look?: { x: number; y: number }; className?: string }) {
  const player = usePlayer();
  const ref = useRef<SVGSVGElement>(null);
  const key = playerKey(player);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (ref.current) drawPortrait(player.def, ref.current, look, 'smile', player.outfit); }, [key]);
  return (
    <g className={className} transform={`translate(${x} ${y})`} data-player={player.def.id}>
      <ellipse cx={0} cy={0} rx={w * 0.33} ry={w * 0.068} fill="url(#hatch)" />
      <g className="bob">
        <svg ref={ref} x={-w / 2} y={-w * (100 / 104)} width={w} height={w} viewBox="-52 -100 104 104" overflow="visible" aria-hidden="true" />
      </g>
    </g>
  );
}
