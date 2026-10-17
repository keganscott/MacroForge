/** The MacroForge mark: a violet keycap with a lime play mark, the same
 * geometry as the app icon (tools/make_icon.py). Decorative. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden focusable="false" className={className}>
      <rect x="5.2" y="5.2" width="21.6" height="21.6" rx="5.5" fill="none" strokeWidth="3.4" className="stroke-violet" />
      <polygon points="13,10.6 21.8,16 13,21.4" className="fill-lime" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className="size-7 shrink-0" />
      <span className="font-display text-[15px] font-extrabold tracking-[0.06em] text-white">
        MACRO<span className="font-medium text-ink-muted">FORGE</span>
      </span>
    </span>
  );
}

/** Violet diamond facets for the hero card, as in PeakTweaks (Facets.tsx). */
export function Facets({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 400 300" preserveAspectRatio="xMaxYMid slice" className={className}>
      <defs>
        <linearGradient id="mf-f1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="white" stopOpacity="0.12" />
          <stop offset="1" stopColor="white" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="mf-f2" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="black" stopOpacity="0.18" />
          <stop offset="1" stopColor="black" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points="200,0 300,100 200,200 100,100" fill="url(#mf-f1)" />
      <polygon points="300,100 400,0 400,200" fill="url(#mf-f2)" />
      <polygon points="300,100 400,200 300,300 200,200" fill="url(#mf-f1)" />
      <polygon points="200,200 300,300 100,300" fill="url(#mf-f2)" />
      <polygon points="100,100 200,200 100,300 0,200" fill="url(#mf-f2)" opacity="0.6" />
      <polygon points="300,0 400,0 300,100 200,0" fill="url(#mf-f2)" opacity="0.7" />
      <g stroke="white" strokeOpacity="0.07" fill="none">
        <path d="M100 100 L200 0 L300 100 L400 0 M100 100 L200 200 L300 100 L400 200 M0 200 L100 300 M200 200 L300 300 L400 200 M100 300 L200 200" />
      </g>
    </svg>
  );
}
