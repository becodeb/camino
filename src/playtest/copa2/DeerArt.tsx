// Copa v2 (C10): the deer of "Ayudá al ciervo". The six garden critters have no
// deer, so it is drawn here in the same recipe (one ink outline, a darker flat
// facet, the same eyes) at the critters' scale: `DeerDriver` sits in a kart
// like `CritterDriver`; `DeerDeed` is the big one for the thank-you screen.

import { blob, smoothClosed } from '../../ink/ink.js';

const INK = '#2b2622';
const CREAM = '#fbf6ea';
const FUR = '#c28a52';
const DARK = '#a06c3a';

function Deer({ bare }: { bare?: boolean }) {
  const body = smoothClosed([[-14, -2], [-20, -22], [-14, -42], [0, -50], [14, -42], [20, -22], [14, -2]]);
  const head = smoothClosed([[-15, -58], [-17, -74], [-8, -80], [0, -81], [8, -80], [17, -74], [15, -58], [5, -46], [-5, -46]]);
  const antler = 'M-8,-78 L-14,-96 M-12,-90 L-22,-92 M-12,-90 L-10,-102 M8,-78 L14,-96 M12,-90 L22,-92 M12,-90 L10,-102';
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {!bare && <ellipse cx={0} cy={1} rx={30} ry={5} fill="url(#hatch)" />}
      <path d={body} fill={FUR} stroke={INK} strokeWidth={2.6} />
      <path d={smoothClosed([[-8, -44], [8, -44], [10, -26], [0, -14], [-10, -26]])} fill={CREAM} stroke={INK} strokeWidth={2} />
      {[-8, 6].map((x) => <path key={x} d={blob(x, -2, 6, 3.6, { seed: x + 30, n: 7 })} fill="#5c4632" stroke={INK} strokeWidth={2} />)}
      <path d={antler} fill="none" stroke={INK} strokeWidth={4.6} />
      <path d={antler} fill="none" stroke="#e6d2a8" strokeWidth={2} />
      <path d="M-14,-72 L-26,-78 L-17,-64 Z" fill={DARK} stroke={INK} strokeWidth={2} />
      <path d="M14,-72 L26,-78 L17,-64 Z" fill={DARK} stroke={INK} strokeWidth={2} />
      <path d={head} fill={FUR} stroke={INK} strokeWidth={2.6} />
      <path d={smoothClosed([[-9, -58], [0, -56], [9, -58], [6, -48], [0, -45], [-6, -48]])} fill={CREAM} stroke={INK} strokeWidth={1.8} />
      {[-7, 7].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy={-66} rx={3.4} ry={4} fill={CREAM} stroke={INK} strokeWidth={2.2} />
          <circle cx={x} cy={-65.6} r={2} fill={INK} />
        </g>
      ))}
      <path d={blob(0, -50, 3.2, 2.4, { seed: 5, n: 7 })} fill={INK} />
    </g>
  );
}

/** The deer at the wheel of a kart: same seat as the garden's critters. `bare`: no ground shadow (the header's small picture). */
export function DeerDriver({ bare }: { bare?: boolean }) {
  return bare ? <g transform="translate(0 -4)"><Deer bare /></g> : <g transform="translate(2 -2) scale(0.72)"><Deer bare /></g>;
}

/** The deer, big, with a flag: ¡Lo arreglaste! */
export function DeerDeed() {
  return (
    <svg className="gx-deer-art" viewBox="-70 -120 140 130" role="img" aria-label="El ciervo llegó a la meta">
      <Deer />
      <path d="M32,-2 V-60" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      <path d="M33,-60 L58,-52 L33,-42 Z" fill="#a4b86d" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
    </svg>
  );
}
