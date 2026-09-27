// Hash routes (curriculum/route.ts): #/ the home page (the whole tramo),
// #/nivel/<id> one page of the demo, #/1ro the forest map of 1ro's year,
// #/1ro/hoja/<n>/… a sheet of that year.

import { useEffect, useState } from 'react';
import { InkDefs } from './ui/InkDefs';
import { HomeScreen } from './screens/HomeScreen';
import { LevelScreen } from './screens/LevelScreen';
import { ForestMap } from './screens/ForestMap';
import { SheetScreen } from './screens/SheetScreen';
import { DevDrawer } from './screens/DevDrawer';
import { levelById } from './game/levels';
import { parseRoute, type Route } from './curriculum/route';
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
  if (route.screen === 'map') return <ForestMap />;
  if (route.screen === 'sheet') return <SheetScreen key={hash} n={route.n} page={route.page} />;
  if (route.screen === 'level') {
    const level = levelById(route.id);
    if (level) return <LevelScreen key={level.id} level={level} />;
  }
  return <HomeScreen />;
}

export function App() {
  const hash = useHash();
  const route = parseRoute(hash);
  useEffect(() => { window.scrollTo(0, 0); }, [hash]);
  return (
    <>
      <InkDefs />
      <Screen route={route} hash={hash} />
      <DevDrawer route={route} />
    </>
  );
}
