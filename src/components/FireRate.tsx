// "Match a gun's fire rate": enter the gun's rounds per minute and your
// frame rate; it works out the fastest rate that never clicks before the gun
// is ready, and shows what the current rate costs. Model: src/lib/firerate.ts.

import { useMemo, useState } from "react";
import { ChevronDown, Crosshair } from "lucide-react";

import { cooldownMs, dropShare, holdFor, safeRate, simulate } from "../lib/firerate";
import { fmtRate } from "../lib/describe";
import { Button, cx, NumberField, Segmented } from "./ui";

export function FireRateHelper({
  rate,
  onRate,
  holdMs = 0,
  onAutoHold,
  defaultOpen = false,
}: {
  rate: number;
  onRate: (r: number) => void;
  /** The binding's press length (0 = Auto). */
  holdMs?: number;
  /** Switch the press length to Auto (shown when a short press loses clicks). */
  onAutoHold?: () => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [unit, setUnit] = useState<"rpm" | "sps">("rpm");
  const [gun, setGun] = useState(600); // in `unit`
  const [fps, setFps] = useState(144);
  const rpm = unit === "rpm" ? gun : gun * 60;

  const r = useMemo(() => {
    const best = safeRate(rpm, fps);
    if (!best) return null;
    const cur = simulate(rate, rpm, fps, { holdMs });
    const lost = dropShare(rate, rpm, fps, holdMs);
    const bestSim = simulate(best, rpm, fps, { holdMs });
    const bestLost = dropShare(best, rpm, fps, holdMs);
    const frame = 1000 / fps;
    // A custom press shorter than a frame can slip between frames unseen.
    const shortPress = holdMs > 0 && holdFor(best, holdMs) < frame * 1.1;
    return { best, lost, bestLost, shortPress, curShots: cur.shotsPerSec, bestShots: bestSim.shotsPerSec, limit: rpm / 60, cooldown: cooldownMs(rpm), frame };
  }, [rate, rpm, fps, holdMs]);

  const atBest = r ? Math.abs(rate - r.best) < 0.01 : false;

  return (
    <div className={cx("rounded-xl border", open ? "border-violet/50 bg-violet/[0.05]" : "border-line")}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        <Crosshair aria-hidden className={cx("size-4 shrink-0", open ? "text-violet" : "text-ink-faint")} />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold text-ink">Match a gun’s fire rate</span>
          <span className="block text-[11px] text-ink-muted">Fire as fast as the gun allows without losing shots.</span>
        </span>
        <ChevronDown aria-hidden className={cx("size-4 text-ink-faint transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-line px-3 pt-3 pb-3.5">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-ink">Gun fire rate</span>
              <span className="flex items-center gap-2">
                <NumberField label="Gun fire rate" min={1} max={unit === "rpm" ? 6000 : 100} step={unit === "rpm" ? 10 : 0.5} value={gun} onChange={setGun} width="w-24" />
                <Segmented
                  size="sm"
                  label="Unit"
                  value={unit}
                  onChange={(u) => {
                    setGun(u === "rpm" ? Math.round(rpm) : Number((rpm / 60).toFixed(2)));
                    setUnit(u);
                  }}
                  options={[
                    { value: "rpm", label: "RPM" },
                    { value: "sps", label: "per sec" },
                  ]}
                />
              </span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-ink">Your FPS in game</span>
              <NumberField label="Your FPS in game" min={10} max={1000} step={10} value={fps} onChange={setFps} width="w-20" />
            </label>
          </div>

          {r && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className={cx("rounded-lg border p-2.5", r.lost > 0.005 ? "border-bad/40 bg-bad/5" : "border-line bg-surface-2")}>
                  <p className="text-[10px] font-bold tracking-wider text-ink-faint uppercase">Now · {fmtRate(rate)}/s</p>
                  <p className="mt-0.5 font-mono text-lg font-bold">{r.curShots.toFixed(1)} <span className="text-xs text-ink-muted">shots/s</span></p>
                  <p className={cx("text-[11px] font-semibold", r.lost > 0.005 ? "text-bad" : "text-ink-muted")}>
                    {r.lost > 0.005 ? `${Math.round(r.lost * 100)}% of clicks lost` : "No clicks lost"}
                  </p>
                </div>
                <div className="rounded-lg border border-lime/40 bg-lime/5 p-2.5">
                  <p className="text-[10px] font-bold tracking-wider text-ink-faint uppercase">Best · {r.best.toFixed(2)}/s</p>
                  <p className="mt-0.5 font-mono text-lg font-bold">{r.bestShots.toFixed(1)} <span className="text-xs text-ink-muted">shots/s</span></p>
                  <p className={cx("text-[11px] font-semibold", r.bestLost > 0.005 ? "text-bad" : "text-lime")}>
                    {r.bestLost > 0.005 ? `${Math.round(r.bestLost * 100)}% lost: press too short` : "No clicks lost"}
                  </p>
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-ink-muted">
                The gun allows {fmtRate(r.limit)}/s (one shot every {r.cooldown.toFixed(1)} ms). Your game only sees a click on its next frame (every {r.frame.toFixed(1)} ms), so
                clicks timed right at the limit sometimes register a frame early, before the gun is ready, and are lost. One click every{" "}
                {(r.cooldown + r.frame * 1.1).toFixed(1)} ms (the gun’s time plus one frame) never is.
              </p>
              {r.shortPress && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-bad/40 bg-bad/5 px-2.5 py-2 text-[11px] text-ink">
                  <span className="min-w-0 flex-1">
                    Each press is held {holdMs} ms, shorter than one frame ({r.frame.toFixed(1)} ms), so the game can miss presses entirely.
                  </span>
                  {onAutoHold && (
                    <Button size="sm" onClick={onAutoHold}>
                      Use Auto press length
                    </Button>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant={atBest ? "secondary" : "primary"} disabled={atBest} onClick={() => onRate(Number(r.best.toFixed(2)))}>
                  {atBest ? "Using the best rate" : `Use ${r.best.toFixed(2)}/s`}
                </Button>
                <span className="text-[11px] text-ink-faint">Some games queue an early click instead of losing it; in those, the gun’s full rate works too.</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
