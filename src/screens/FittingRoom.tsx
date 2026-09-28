// The fitting room (dev, `#/probador`): every wardrobe piece on each of the
// four characters, alone and all together, drawn big, to review the fitting
// points of ui/outfit.ts by eye. Not a page of the child's; the dev drawer
// links it.

import { CHARACTERS } from '../ink/characters.js';
import { ITEMS, type Outfit } from '../curriculum/motivation';
import { Portrait } from '../ui/art';
import { CRITTER_IDS, RARE_IDS } from '../curriculum/motivation';
import { CritterArt } from '../ui/critterArt';
import { RarePlantArt } from '../ui/gardenArt';

const FULL: Outfit[] = [
  { head: 'hongo', neck: 'bufanda', back: 'mochila', feet: 'botas' },
  { head: 'corona', back: 'capa', waist: 'flotador', feet: 'botas' },
];

export function FittingRoom() {
  return (
    <main className="fitting">
      <h1 className="fitting-title">Probador <small>(dev: cada prenda en cada personaje)</small></h1>
      <table className="fitting-grid">
        <thead>
          <tr><th />{ITEMS.map((i) => <th key={i.id}>{i.id}</th>)}<th>todo 1</th><th>todo 2</th></tr>
        </thead>
        <tbody>
          {CHARACTERS.map((c) => (
            <tr key={c.id}>
              <th>{c.name}</th>
              {ITEMS.map((i) => <td key={i.id}><Portrait def={c} outfit={{ [i.slot]: i.id }} className="fitting-face" /></td>)}
              {FULL.map((o, k) => <td key={k}><Portrait def={c} outfit={o} className="fitting-face" /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="fitting-title">Bichos y plantas <small>(en color y en silueta, como esperan en la fila)</small></h2>
      <div className="fitting-row">
        {CRITTER_IDS.map((id) => (
          <figure key={id} className="fitting-cell">
            <svg viewBox="-70 -130 140 140" className="fitting-critter"><CritterArt id={id} /></svg>
            <svg viewBox="-70 -130 140 140" className="fitting-critter"><g filter="url(#silhouette)"><CritterArt id={id} bare /></g></svg>
            <figcaption>{id}</figcaption>
          </figure>
        ))}
      </div>
      <div className="fitting-row">
        {RARE_IDS.map((id) => (
          <figure key={id} className="fitting-cell">
            <svg viewBox="-70 -150 140 160" className="fitting-critter"><RarePlantArt id={id} /></svg>
            <svg viewBox="-70 -150 140 160" className="fitting-critter"><g filter="url(#silhouette)"><RarePlantArt id={id} /></g></svg>
            <figcaption>{id}</figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
