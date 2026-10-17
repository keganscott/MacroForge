// MacroForge's brand pieces (docs/DESIGN.md). Family DNA: a coloured mark
// with one lime element, the two-weight caps wordmark. MacroForge's own:
// the keycap mark and the signal trace.

import { cx } from "./ui";

/** The keycap mark, same geometry as the app icon (tools/make_icon.py). */
export function LogoMark({ className, off = false }: { className?: string; off?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden focusable="false" className={className}>
      <rect x="5" y="5" width="22" height="22.6" rx="5.6" className={off ? "fill-ink-faint" : "fill-violet"} />
      <rect x="8.2" y="8.2" width="15.6" height="14.2" rx="3.4" className="fill-surface-1" />
      <polygon points="13.4,11.2 20.2,15.3 13.4,19.4" className={off ? "fill-ink-faint" : "fill-lime"} />
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

// ------------------------------------------------------------------ trace --

/** Deterministic pulses for one lane: [start, width] pairs within 0..W. */
function pulses(seed: number, w: number, minGap: number, maxGap: number, minW: number, maxW: number): [number, number][] {
  let x = seed % 37;
  let r = seed * 9301 + 49297;
  const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const out: [number, number][] = [];
  while (x < w - maxW) {
    const width = minW + rand() * (maxW - minW);
    out.push([x, width]);
    x += width + minGap + rand() * (maxGap - minGap);
  }
  return out;
}

function lanePath(ps: [number, number][], y: number, h: number, offset: number): string {
  let d = `M ${offset} ${y}`;
  for (const [x, w] of ps) {
    d += ` H ${offset + x} V ${y - h} H ${offset + x + w} V ${y}`;
  }
  return d + ` H ${offset + 600}`;
}

const LANES = [
  { y: 26, ps: pulses(3, 600, 22, 60, 6, 26), lime: false },
  { y: 54, ps: pulses(11, 600, 14, 34, 4, 10), lime: true },
  { y: 82, ps: pulses(29, 600, 40, 110, 18, 54), lime: false },
];

/**
 * MacroForge's motif: key presses drawn as signal lines, like a logic
 * analyser. Scrolls while `live`; flat grey while off. Decorative.
 */
export function SignalTrace({ live, className }: { live: boolean; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 600 96" preserveAspectRatio="none" className={cx("overflow-hidden", className)}>
      <g className={live ? "animate-trace" : undefined} style={{ transformBox: "fill-box" }}>
        {LANES.map((l, i) =>
          [0, 600].map((offset) => (
            <path
              key={`${i}-${offset}`}
              d={live ? lanePath(l.ps, l.y, 16, offset) : `M ${offset} ${l.y} H ${offset + 600}`}
              fill="none"
              strokeWidth={live ? 1.6 : 1}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className={live ? (l.lime ? "stroke-lime" : "stroke-violet") : "stroke-line-strong"}
              opacity={live ? (l.lime ? 0.9 : 0.75) : 1}
            />
          )),
        )}
      </g>
    </svg>
  );
}
