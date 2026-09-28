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
        {/* what is still to come (a wardrobe piece locked, a critter on its way): one flat pale shape with a soft ink rim */}
        <filter id="silhouette" x="-10%" y="-10%" width="120%" height="120%">
          <feFlood floodColor="#ddd1ba" result="pale" />
          <feComposite in="pale" in2="SourceAlpha" operator="in" result="shape" />
          <feMorphology in="SourceAlpha" operator="dilate" radius="1.3" result="fat" />
          <feFlood floodColor="#2b2622" floodOpacity="0.5" result="rimInk" />
          <feComposite in="rimInk" in2="fat" operator="in" result="rim" />
          <feMerge><feMergeNode in="rim" /><feMergeNode in="shape" /></feMerge>
        </filter>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#2b2622" strokeWidth="1.6" opacity="0.55" />
        </pattern>
        {/* the fog of 2do: soft pencil hatching, in two passes like a child shading */}
        <pattern id="fog-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)">
          <line x1="0" y1="0" x2="0" y2="9" stroke="#47444c" strokeWidth="1.5" opacity="0.42" />
          <line x1="4.5" y1="0" x2="4.5" y2="5" stroke="#47444c" strokeWidth="1.2" opacity="0.24" />
        </pattern>
      </defs>
    </svg>
  );
}
