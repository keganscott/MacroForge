// A macro drawn as signal lanes, MacroForge's motif put to work: one lane
// per key or button, a bar for each moment it is held, the waits as gaps.
// Click a bar to select its step; a playhead runs across during Test play.

import { useEffect, useMemo, useRef, useState } from "react";

import { fmtMs, stepSummary } from "../lib/describe";
import { keyName } from "../lib/keys";
import type { Step } from "../lib/types";
import { cx } from "./ui";

interface Bar {
  lane: string;
  start: number;
  end: number;
  step: number;
  open?: boolean;
  tick?: boolean;
}

const MAX_LANES = 8;

export function layout(steps: Step[]): { bars: Bar[]; lanes: string[]; total: number } {
  const bars: Bar[] = [];
  const open = new Map<number, Bar>();
  let t = 0;
  steps.forEach((s, i) => {
    switch (s.type) {
      case "press":
        bars.push({ lane: keyName(s.input), start: t, end: t + s.holdMs, step: i, tick: s.holdMs === 0 });
        t += s.holdMs;
        break;
      case "down": {
        const b: Bar = { lane: keyName(s.input), start: t, end: t, step: i, open: true };
        open.set(s.input, b);
        bars.push(b);
        break;
      }
      case "up": {
        const b = open.get(s.input);
        if (b) {
          b.end = t;
          b.open = false;
          open.delete(s.input);
        } else bars.push({ lane: keyName(s.input), start: t, end: t, step: i, tick: true });
        break;
      }
      case "delay":
        t += s.ms;
        break;
      case "text": {
        const d = Math.max(0, s.text.length - 1) * s.charDelayMs;
        bars.push({ lane: "Text", start: t, end: t + d, step: i, tick: d === 0 });
        t += d;
        break;
      }
      case "wheel":
        bars.push({ lane: "Scroll", start: t, end: t, step: i, tick: true });
        break;
      case "move":
        bars.push({ lane: "Mouse", start: t, end: t + s.durationMs, step: i, tick: s.durationMs === 0 });
        t += s.durationMs;
        break;
      case "moveTo":
        bars.push({ lane: "Mouse", start: t, end: t, step: i, tick: true });
        break;
    }
  });
  // Keys still held at the end run to the end (MacroForge releases them then).
  for (const b of open.values()) b.end = t;
  const order: string[] = [];
  for (const b of bars) if (!order.includes(b.lane)) order.push(b.lane);
  let lanes = order;
  if (order.length > MAX_LANES) {
    const keep = new Set(order.slice(0, MAX_LANES - 1));
    for (const b of bars) if (!keep.has(b.lane)) b.lane = "Other";
    lanes = [...order.slice(0, MAX_LANES - 1), "Other"];
  }
  return { bars, lanes, total: t };
}

function niceStep(total: number): number {
  const raw = total / 6;
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-6)));
  for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

export function MacroTimeline({
  steps,
  selected,
  onSelect,
  playing,
}: {
  steps: Step[];
  selected: number | null;
  onSelect: (i: number) => void;
  playing: boolean;
}) {
  const { bars, lanes, total } = useMemo(() => layout(steps), [steps]);
  const span = Math.max(total, 1);
  const pct = (ms: number) => `${(ms / span) * 100}%`;
  const tickEvery = niceStep(span);
  const ticks = Array.from({ length: Math.floor(span / tickEvery) + 1 }, (_, i) => i * tickEvery);

  // Playhead: from the moment playing starts, across one pass.
  const [head, setHead] = useState<number | null>(null);
  const raf = useRef(0);
  useEffect(() => {
    if (!playing) {
      setHead(null);
      return;
    }
    const start = performance.now();
    const loop = () => {
      const e = performance.now() - start;
      setHead(Math.min(e, span));
      if (e < span) raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, span]);

  if (bars.length === 0) return null;

  return (
    <div className="mb-4 rounded-2xl border border-line bg-surface-1 p-4 texture-grid">
      <div className="flex">
        <div className="w-24 shrink-0" />
        <div className="relative h-5 flex-1">
          {ticks.map((t) => (
            <span key={t} className="absolute top-0 -translate-x-1/2 font-mono text-[10px] text-ink-faint" style={{ left: pct(t) }}>
              {fmtMs(t)}
            </span>
          ))}
        </div>
      </div>
      <div className="relative">
        {lanes.map((lane) => (
          <div key={lane} className="flex h-7 items-center">
            <span className="w-24 shrink-0 truncate pr-3 text-right font-mono text-[11px] text-ink-muted">{lane}</span>
            <div className="relative h-full flex-1 border-b border-line/60">
              {bars
                .filter((b) => b.lane === lane)
                .map((b, k) => {
                  const sel = b.step === selected;
                  return (
                    <button
                      key={k}
                      type="button"
                      title={`Step ${b.step + 1}: ${stepSummary(steps[b.step]!)}`}
                      aria-label={`Step ${b.step + 1}`}
                      onClick={() => onSelect(b.step)}
                      className={cx(
                        "absolute top-1.5 h-4 rounded-[3px] transition-colors",
                        b.tick ? "w-[3px] -translate-x-1/2" : "min-w-[3px]",
                        sel ? "bg-lime" : "bg-violet/80 hover:bg-violet",
                        b.open && "rounded-r-none",
                      )}
                      style={{ left: pct(b.start), width: b.tick ? undefined : pct(b.end - b.start) }}
                    />
                  );
                })}
            </div>
          </div>
        ))}
        {ticks.map((t) => (
          <span key={t} aria-hidden className="pointer-events-none absolute top-0 bottom-0 border-l border-dashed border-line" style={{ left: `calc(6rem + (100% - 6rem) * ${t / span})` }} />
        ))}
        {head !== null && (
          <span aria-hidden className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-lime shadow-[0_0_10px_var(--color-lime)]" style={{ left: `calc(6rem + (100% - 6rem) * ${head / span})` }} />
        )}
      </div>
      <p className="mt-2 pl-24 text-[11px] text-ink-faint">
        One pass: {fmtMs(total)} · gaps are waits · click a bar to select its step
      </p>
    </div>
  );
}
