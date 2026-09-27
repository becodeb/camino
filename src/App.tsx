// Hash routes: #/ the home page (the whole tramo), #/nivel/<id> one page.

import { useEffect, useState } from 'react';
import { InkDefs } from './ui/InkDefs';
import { HomeScreen } from './screens/HomeScreen';
import { LevelScreen } from './screens/LevelScreen';
import { levelById } from './game/levels';
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

export function App() {
  const hash = useHash();
  const m = hash.match(/^#\/nivel\/([\w-]+)/);
  const level = m ? levelById(m[1]) : null;
  useEffect(() => { window.scrollTo(0, 0); }, [hash]);
  return (
    <>
      <InkDefs />
      {level ? <LevelScreen key={level.id} level={level} /> : <HomeScreen />}
    </>
  );
}
