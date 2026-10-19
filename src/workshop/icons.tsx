// Small drawn icons for the Workshop's buttons (T40): the system's emoji
// and symbol glyphs are missing on the classroom machines' fonts, so every
// icon is ink on paper, like the rest.

const S = { fill: 'none', stroke: '#2b2622', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const IconBulb = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="ws-ico">
    <path d="M12,3 C7.5,3 5,6.4 5,9.6 C5,12.3 6.8,13.6 8,15 L8,17 L16,17 L16,15 C17.2,13.6 19,12.3 19,9.6 C19,6.4 16.5,3 12,3 Z" {...S} fill="#f0d27a" />
    <path d="M9,20 L15,20 M10.5,17 L10.5,13 Q12,11.5 13.5,13 L13.5,17" {...S} strokeWidth={1.8} />
  </svg>
);
export const IconCenter = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="ws-ico">
    <circle cx={12} cy={12} r={6.5} {...S} /><circle cx={12} cy={12} r={1.8} fill="#2b2622" />
    <path d="M12,2 L12,5 M12,19 L12,22 M2,12 L5,12 M19,12 L22,12" {...S} />
  </svg>
);
export const IconTidy = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="ws-ico">
    <rect x={4} y={3.5} width={12} height={5} rx={1.5} {...S} fill="#f5c64f" />
    <rect x={4} y={10} width={16} height={5} rx={1.5} {...S} fill="#7aa6e8" />
    <rect x={4} y={16.5} width={10} height={5} rx={1.5} {...S} fill="#f6b45a" />
  </svg>
);
export const IconDup = ({ size = 20 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="ws-ico">
    <rect x={8} y={8} width={12} height={12} rx={2.5} {...S} fill="#fbf7ee" />
    <rect x={4} y={4} width={12} height={12} rx={2.5} {...S} fill="#a9c3de" />
    <path d="M10,7.5 L10,12.5 M7.5,10 L12.5,10" {...S} strokeWidth={2} />
  </svg>
);
export const IconTrash = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="ws-ico">
    <path d="M5,7 L19,7 M9.5,7 L10,4 L14,4 L14.5,7 M6.5,7 L7.5,20 L16.5,20 L17.5,7" {...S} />
    <path d="M10,10.5 L10.4,17 M14,10.5 L13.6,17" {...S} strokeWidth={1.8} />
  </svg>
);
export const IconEye = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="ws-ico">
    <path d="M2.5,12 C6,6 18,6 21.5,12 C18,18 6,18 2.5,12 Z" {...S} fill="#fbf7ee" /><circle cx={12} cy={12} r={3.2} fill="#2b2622" />
  </svg>
);
export const IconBigger = ({ big }: { big: boolean }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="ws-ico">
    {big
      ? <path d="M9,3 L9,9 L3,9 M15,3 L15,9 L21,9 M9,21 L9,15 L3,15 M15,21 L15,15 L21,15" {...S} strokeWidth={2.4} />
      : <path d="M3,9 L3,3 L9,3 M21,9 L21,3 L15,3 M3,15 L3,21 L9,21 M21,15 L21,21 L15,21" {...S} strokeWidth={2.4} />}
  </svg>
);
export const IconStar = ({ on }: { on: boolean }) => (
  <svg viewBox="-14 -14 28 28" width="30" height="30" aria-hidden="true" className="ws-ico">
    <path d="M0,-12 L3.5,-4 L12,-3.5 L5.5,2.5 L7.5,11 L0,6.5 L-7.5,11 L-5.5,2.5 L-12,-3.5 L-3.5,-4 Z" fill={on ? '#f0d27a' : '#f2ebde'} stroke="#2b2622" strokeWidth={1.8} strokeLinejoin="round" />
  </svg>
);
export const IconSound = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="ws-ico">
    <path d="M3,9.5 L7,9.5 L12,5 L12,19 L7,14.5 L3,14.5 Z" {...S} fill="#e59ad0" />
    <path d="M15,9 Q17,12 15,15 M17.5,6.5 Q21.5,12 17.5,17.5" {...S} strokeWidth={2} />
  </svg>
);
