// Hash routes (curriculum/route.ts): #/ the home page (the whole tramo),
// #/nivel/<id> one page of the demo, #/1ro the forest map of 1ro's year,
// #/1ro/hoja/<n>/… a sheet of that year. #/piloto the pilot playtest (the
// root of a playtest build, VITE_PLAYTEST=1, where #/demo is the demo's home).

import { useEffect, useState } from 'react';
import { InkDefs } from './ui/InkDefs';
import { HomeScreen } from './screens/HomeScreen';
import { LevelScreen } from './screens/LevelScreen';
import { ForestMap } from './screens/ForestMap';
import { SheetScreen } from './screens/SheetScreen';
import { DevDrawer } from './screens/DevDrawer';
import { YearPlayer } from './screens/player';
import { FittingRoom } from './screens/FittingRoom';
import { WardrobePage } from './screens/WardrobeScreen';
import { GardenPage } from './screens/GardenScreen';
import { PreviewHost } from './screens/PreviewCard';
import { levelById } from './game/levels';
import { parseRoute, type Route } from './curriculum/route';
import { PlaytestScreen } from './playtest/PlaytestScreen';
import { PLAYTEST_BUILD, routeFor } from './playtest/mode';
import { holdingHash } from './playtest/hashHold';
import { DEBUG } from './screens/levelKit';
import './ui/runtime';

function useHash() {
  const [hash, setHash] = useState(() => location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(location.hash || '#/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

function Screen({ route, hash }: { route: Route; hash: string }) {
  if (route.screen === 'map') return <YearPlayer><ForestMap /></YearPlayer>;
  if (route.screen === 'sheet') return <YearPlayer><SheetScreen key={hash} n={route.n} page={route.page} /></YearPlayer>;
  if (route.screen === 'fitting') return <FittingRoom />;
  if (route.screen === 'piloto') return <PlaytestScreen />;
  if (route.screen === 'wardrobe') return <YearPlayer><WardrobePage /></YearPlayer>;
  if (route.screen === 'garden') return <YearPlayer><GardenPage key={route.seeds ?? 'mine'} preview={route.seeds} /></YearPlayer>;
  if (route.screen === 'level') {
    const level = levelById(route.id);
    if (level) return <LevelScreen key={level.id} level={level} />;
  }
  return <HomeScreen />;
}

export function App() {
  const hash = useHash();
  // the playtest on screen holds the hash (its activities move by it): it stays on screen
  const route: Route = holdingHash() ? { screen: 'piloto' } : routeFor(hash, parseRoute);
  useEffect(() => { window.scrollTo(0, 0); }, [hash]);
  return (
    <>
      <InkDefs />
      <Screen route={route} hash={hash} />
      <PreviewHost />
      {(!PLAYTEST_BUILD || DEBUG) && <DevDrawer route={route} />}
    </>
  );
}
