// Shared ink filters (docs/05 §3). "boil" gets its seed cycled by the runtime.
export function InkDefs() {
  return (
    <svg className="defs" aria-hidden="true" focusable="false" width="0" height="0">
      <defs>
        <filter id="boil" x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence id="boil-noise" type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed="1" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="rough" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves={2} seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3.6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="rough-lg" x="-3%" y="-3%" width="106%" height="106%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves={2} seed="9" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#2b2622" strokeWidth="1.6" opacity="0.55" />
        </pattern>
      </defs>
    </svg>
  );
}
