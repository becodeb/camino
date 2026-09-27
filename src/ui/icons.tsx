// Small hand-drawn icons for buttons (26px, ink outline), in the demo's language.
// Ported from habilidades (app/src/ui/icons.tsx @ 9b90d1d).

export const PlayIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7,4.5 L19.5,12.3 L6.5,19.6 Z" fill="#fbf6ea" stroke="#2b2622" strokeWidth="2.2" strokeLinejoin="round" /></svg>
);

/** "Next page": the demo's Otro icon, a sheet with a folded corner. */
export const NextIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6,3.5 L15,3.5 L19,8 L19,20.5 L6,20.5 Z" fill="#fbf6ea" stroke="#2b2622" strokeWidth="2" strokeLinejoin="round" /><path d="M15,3.5 L15,8 L19,8" fill="none" stroke="#2b2622" strokeWidth="2" strokeLinejoin="round" /><path d="M9,13.5 L15.5,13.5 M12.8,10.8 L15.6,13.5 L12.8,16.2" fill="none" stroke="#3d6ea5" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export const SpeakerIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4,9.5 L8,9.5 L13,5 L13,19 L8,14.5 L4,14.5 Z" fill="#f0d27a" stroke="#2b2622" strokeWidth="2" strokeLinejoin="round" />
    <path d="M16,9 Q18.5,12 16,15" fill="none" stroke="#2b2622" strokeWidth="2" strokeLinecap="round" />
    <path d="M18.5,6.5 Q23,12 18.5,17.5" fill="none" stroke="#2b2622" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/** "Volver a empezar": a hand-drawn circular arrow (docs/17). */
export const RestartIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M18.6,9.2 C17.2,5.8 13.4,4.2 9.9,5.3 C6.2,6.5 4.2,10.4 5.3,14.1 C6.4,17.8 10.3,19.9 14,18.8 C16.2,18.1 17.8,16.5 18.5,14.5" fill="none" stroke="#2b2622" strokeWidth="2.3" strokeLinecap="round" />
    <path d="M19.4,4.6 L18.9,9.6 L14.1,8.6" fill="none" stroke="#2b2622" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** "Ayuda": a raised hand (docs/17), the palm facing the child. */
export const HelpIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M7.4,13.2 L7.2,6.6 C7.2,5.3 9.1,5.2 9.2,6.5 L9.4,11.2 L9.3,4.4 C9.3,3 11.3,3 11.4,4.4 L11.6,10.8 L11.7,4.1 C11.8,2.7 13.8,2.8 13.8,4.2 L13.8,11 L14.3,5.5 C14.4,4.2 16.3,4.3 16.3,5.6 L16.1,13.4 L17.6,11.2 C18.4,10 20.2,10.9 19.5,12.3 C18.4,14.6 17.2,17.4 15.4,19.1 C14.3,20.2 12.8,20.8 11.3,20.8 C8.8,20.8 7.4,19 7.4,16.4 Z"
      fill="#eeac7f" stroke="#2b2622" strokeWidth="1.8" strokeLinejoin="round"
    />
    <path d="M3.6,6.2 L2.2,5.2 M4.4,3.4 L3.8,1.8 M21.6,6.4 L23,5.6" stroke="#3d6ea5" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
