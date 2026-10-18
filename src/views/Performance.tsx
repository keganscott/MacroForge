// Measured, not claimed: the engine's health at a glance, trigger-to-output
// latency against one game frame, the rhythm of the last rapid fire, wait
// accuracy on this PC per timing mode, and a live input monitor.

import { useEffect, useRef, useState } from "react";
import { Activity, Check, Cpu, Gauge, Play, Radio, RotateCcw, Timer, Waves } from "lucide-react";

import { Metric, Panel } from "../components/Panel";
import { Button, cx, LiveDot, StatusBadge, Switch } from "../components/ui";
import { useActiveInterval } from "../lib/active";
import { fmtUs } from "../lib/describe";
import { keyName } from "../lib/keys";
import type { BenchRow, MonitorEvent, Settings, Stats } from "../lib/types";
import { backend, setSettings, useStore } from "../store";

/** One frame at 144 Hz, in µs: the yardstick for "fast enough". */
const FRAME_US = 1_000_000 / 144;

export function PerformanceView() {
  const status = useStore((s) => s.status)!;
  const timing = useStore((s) => s.data!.settings.timing);
  const [stats, setStats] = useState<Stats | null>(null);

  useActiveInterval(() => void backend().getStats().then(setStats), 1000);

  const hooksOk = status.hook.keyboard;
  const refused = stats?.sendFailures ?? 0;
  const slow = !!stats?.latencySamples && stats.latencyP99Us > FRAME_US / 2;
  const healthy = hooksOk && refused === 0 && !slow;

  return (
    <>
      <header className="mb-7">
        <h1 className="text-3xl font-extrabold tracking-tight">Performance</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">Measured on this PC while MacroForge runs. Nothing here is an estimate.</p>
      </header>

      <div className="flex flex-col gap-5">
        {/* ------------------------------------------------ health */}
        <Panel
          glow
          icon={<Gauge aria-hidden className="size-5" />}
          title={
            <span className="flex flex-wrap items-center gap-3">
              {healthy ? "Running clean" : !hooksOk ? "Input hook missing" : refused ? "Windows refused some output" : "Slower than usual"}
              <span className={cx("inline-flex items-center gap-1.5 text-xs font-bold", healthy ? "text-lime" : "text-bad")}>
                <LiveDot className={healthy ? undefined : "bg-bad"} /> {healthy ? "Healthy" : "Check below"}
              </span>
            </span>
          }
          blurb={
            healthy
              ? "Your presses reach MacroForge and its output goes out with room to spare."
              : !hooksOk
                ? "Without the keyboard hook no binding can fire. Restart MacroForge; if it keeps happening, run it as administrator."
                : refused
                  ? "Usually a game running as administrator while MacroForge is not. Home shows a button to fix that."
                  : "Responses are taking longer than normal. Close heavy background apps, or switch Timing to Precise."
          }
          aside={
            <Button size="sm" variant="ghost" icon={<RotateCcw aria-hidden className="size-3.5" />} onClick={() => void backend().resetStats()}>
              Reset numbers
            </Button>
          }
        >
          <ul className="mb-5 flex flex-wrap gap-2">
            <EngineChip ok={status.hook.keyboard} label="Keyboard hook" value={status.hook.keyboard ? "Installed" : "Not installed"} />
            <EngineChip ok={status.hook.mouse} idle={!status.hook.mouse} label="Mouse hook" value={status.hook.mouse ? "Installed" : "Off, not needed"} />
            <EngineChip ok={status.selfElevated} idle={!status.selfElevated} label="Administrator" value={status.selfElevated ? "Yes" : "No"} />
            <EngineChip ok label="Timing" value={timing === "precise" ? "Precise" : "Efficient"} />
          </ul>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metric
              label="Press to output"
              value={stats?.latencySamples ? fmtUs(stats.latencyP50Us) : "—"}
              tone={stats?.latencySamples ? "lime" : "faint"}
              hint={stats?.latencySamples ? `typical, over ${stats.latencySamples} presses` : "use a binding to measure"}
            />
            <Metric
              label="99% within"
              value={stats?.latencySamples ? fmtUs(stats.latencyP99Us) : "—"}
              tone={stats?.latencySamples ? "ink" : "faint"}
              hint={stats?.latencySamples ? `slowest ${fmtUs(stats.latencyMaxUs)}` : " "}
            />
            <Metric
              label="Hook time"
              value={stats?.hookEvents ? fmtUs(stats.hookAvgUs) : "—"}
              tone={stats?.hookEvents ? "ink" : "faint"}
              hint={stats?.hookEvents ? `added per event · slowest ${fmtUs(stats.hookMaxUs)}` : "added per key event"}
            />
            <Metric
              label="Events seen"
              value={stats ? stats.hookEvents.toLocaleString() : "—"}
              tone={stats ? "ink" : "faint"}
              hint={refused ? <span className="font-bold text-bad">{refused} sends refused by Windows</span> : "0 sends refused by Windows"}
            />
          </div>

          <FrameScale stats={stats} />
        </Panel>

        {/* ------------------------------------------------ rhythm */}
        <Rhythm stats={stats} />

        {/* ------------------------------------------------ timing */}
        <TimingTest timing={timing} />

        {/* ------------------------------------------------ monitor */}
        <Monitor />

        <p className="px-1 text-xs text-ink-faint">
          For the on-screen notice to show over a game, run the game in borderless or windowed fullscreen. If a game runs as administrator, MacroForge needs to as well.
        </p>
      </div>
    </>
  );
}

function EngineChip({ ok, idle, label, value }: { ok: boolean; idle?: boolean; label: string; value: string }) {
  return (
    <li
      className={cx(
        "inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs",
        idle ? "border-line text-ink-muted" : ok ? "border-lime/30 bg-lime/[0.05]" : "border-bad/40 bg-bad/10",
      )}
    >
      <span className={cx("grid size-4 place-items-center rounded-full", idle ? "bg-surface-3 text-ink-faint" : ok ? "bg-lime text-black" : "bg-bad text-white")}>
        {ok && !idle ? <Check aria-hidden className="size-2.5" strokeWidth={4} /> : <span className="size-1 rounded-full bg-current" />}
      </span>
      <span className="text-ink-muted">{label}</span>
      <span className="font-bold text-ink">{value}</span>
    </li>
  );
}

/** Where the response times sit inside one 144 Hz frame. */
function FrameScale({ stats }: { stats: Stats | null }) {
  const has = !!stats?.latencySamples;
  const pct = (us: number) => Math.min(100, (us / FRAME_US) * 100);
  const marks = has
    ? [
        { key: "p50", label: "Typical", us: stats!.latencyP50Us },
        { key: "p99", label: "99%", us: stats!.latencyP99Us },
        { key: "max", label: "Slowest", us: stats!.latencyMaxUs },
      ]
    : [];
  return (
    <div className="mt-5 rounded-xl border border-line bg-surface-0/40 px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-extrabold tracking-tight">Inside one frame</p>
        <p className="text-xs text-ink-muted">
          {has ? (
            <>
              Even the slowest response used <span className="font-bold text-lime">{pct(stats!.latencyMaxUs).toFixed(1)}%</span> of one 144 Hz frame (6.9 ms).
            </>
          ) : (
            "Press a bound key a few times to see where your responses land."
          )}
        </p>
      </div>
      <div className="relative mt-4 h-9">
        <div className="absolute inset-x-0 top-3 h-3 overflow-hidden rounded-full bg-surface-3">
          <span aria-hidden className="absolute inset-0 texture-grid opacity-50" />
          {has && <span className="absolute inset-y-0 left-0 rounded-full bg-lime/80" style={{ width: `max(4px, ${pct(stats!.latencyMaxUs)}%)` }} />}
          {has && <span className="absolute inset-y-0 left-0 rounded-full bg-lime" style={{ width: `max(2px, ${pct(stats!.latencyP50Us)}%)` }} />}
        </div>
        {[0, 25, 50, 75, 100].map((t) => (
          <span
            key={t}
            aria-hidden
            className={cx("absolute top-7 font-mono text-[10px] whitespace-nowrap text-ink-faint", t === 0 ? "" : t === 100 ? "-translate-x-full" : "-translate-x-1/2")}
            style={{ left: `${t}%` }}
          >
            {t === 0 ? "0" : `${((FRAME_US * t) / 100 / 1000).toFixed(1)} ms`}
          </span>
        ))}
      </div>
      {has && (
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          {marks.map((m) => (
            <div key={m.key} className="flex items-center gap-1.5">
              <dt className="text-ink-muted">{m.label}</dt>
              <dd className="font-mono font-bold">{fmtUs(m.us)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** The last rapid fire: its press pattern drawn to scale, and how close each press was to its beat. */
function Rhythm({ stats }: { stats: Stats | null }) {
  const has = !!stats && stats.rapidPresses > 0;
  return (
    <Panel
      icon={<Waves aria-hidden className="size-5" />}
      title="Rapid fire rhythm"
      blurb="How evenly the last rapid fire or auto-clicker actually went out, press by press."
      aside={
        has ? (
          <StatusBadge tone="neutral" icon={false}>
            Last run · {stats!.rapidLabel}
          </StatusBadge>
        ) : undefined
      }
    >
      {has ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.3fr_1fr]">
          <div className="rounded-xl border border-line bg-surface-0/40 px-4 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
              <span className="font-bold text-ink">{(1000 / stats!.rapidTargetMs).toFixed(stats!.rapidTargetMs < 100 ? 1 : 2)} presses a second</span>
              <span className="text-ink-muted">
                every <span className="font-mono text-ink">{stats!.rapidTargetMs.toFixed(1)} ms</span>, held{" "}
                <span className="font-mono text-ink">{stats!.rapidHoldMs.toFixed(1)} ms</span> · {stats!.rapidPresses} presses
              </span>
            </div>
            <PressWave target={stats!.rapidTargetMs} hold={stats!.rapidHoldMs} />
            <p className="mt-2 text-[11px] text-ink-faint">Raised = button down. Each press is drawn at its exact beat: the misses below are too small to see at this scale.</p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Typical" value={fmtUs(stats!.rapidLateP50Us)} tone="lime" hint="off the beat" />
              <Metric label="99%" value={fmtUs(stats!.rapidLateP99Us)} hint="off the beat" />
              <Metric label="Worst" value={fmtUs(stats!.rapidLateMaxUs)} hint="off the beat" />
            </div>
            <p className="text-xs leading-relaxed text-ink-muted">
              The worst press was off by <span className="font-bold text-ink">{((stats!.rapidLateMaxUs / (stats!.rapidTargetMs * 1000)) * 100).toFixed(2)}%</span> of the gap
              between presses. If these stay small while it feels uneven in a game, the game is dropping presses: a slightly slower rate or Auto press length helps.
            </p>
          </div>
        </div>
      ) : (
        <EmptyLine icon={<Waves aria-hidden className="size-5" />}>Use any rapid fire or auto-clicker (in a game is best), then come back: its rhythm shows up here.</EmptyLine>
      )}
    </Panel>
  );
}

function PressWave({ target, hold }: { target: number; hold: number }) {
  const beats = 10;
  const w = 600;
  const h = 64;
  const per = w / beats;
  const duty = Math.min(0.95, Math.max(0.05, hold / target));
  let d = `M0 ${h - 8}`;
  for (let i = 0; i < beats; i++) {
    const x = i * per + 6;
    d += ` L${x} ${h - 8} L${x} 10 L${x + per * duty} 10 L${x + per * duty} ${h - 8}`;
  }
  d += ` L${w} ${h - 8}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-16 w-full" preserveAspectRatio="none" aria-hidden>
      {Array.from({ length: beats + 1 }, (_, i) => (
        <line key={i} x1={i * per + 6} x2={i * per + 6} y1={2} y2={h} stroke="var(--color-line-strong)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      ))}
      <path d={`${d} L${w} ${h} L0 ${h} Z`} fill="var(--color-lime)" opacity={0.08} />
      <path d={d} fill="none" stroke="var(--color-lime)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const MODES: {
  id: Settings["timing"];
  name: string;
  Icon: typeof Cpu;
  what: string;
  cost: string;
}[] = [
  {
    id: "precise",
    name: "Precise",
    Icon: Timer,
    what: "Timer, then a short spin to the exact moment. Presses land within a few µs.",
    cost: "About 2–3% of one CPU core while something runs. Nothing when idle.",
  },
  {
    id: "efficient",
    name: "Efficient",
    Icon: Cpu,
    what: "Timer only, no spinning. Presses land up to about 0.6 ms late, still well under one frame.",
    cost: "About 0% CPU.",
  },
];

/** Log scale from 1 µs to 2 ms, so Precise and Efficient both read on one bar. */
const logPct = (us: number) => Math.max(2, Math.min(100, (Math.log10(Math.max(1, us)) / Math.log10(2000)) * 100));

function TimingTest({ timing }: { timing: Settings["timing"] }) {
  const [bench, setBench] = useState<BenchRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      setBench(await backend().runBenchmark());
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel
      icon={<Timer aria-hidden className="size-5" />}
      title="Timing"
      blurb="How MacroForge waits between presses. The test asks for 1, 5 and 16.7 ms waits many times in each mode and measures how late each one ends (about five seconds)."
      aside={
        <Button size="sm" variant={bench ? "secondary" : "primary"} busy={busy} icon={<Play aria-hidden className="size-3.5" />} onClick={() => void run()}>
          {bench ? "Test again" : "Test this PC"}
        </Button>
      }
    >
      <TimingModes timing={timing} bench={bench} />
    </Panel>
  );
}

/** The two timing modes as radio cards, with this PC's test results when there are some. */
export function TimingModes({ timing, bench }: { timing: Settings["timing"]; bench?: BenchRow[] | null }) {
  return (
    <div role="radiogroup" aria-label="Timing mode" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {MODES.map((m) => {
        const on = timing === m.id;
        const rows = bench?.filter((r) => r.label.toLowerCase() === m.id) ?? [];
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setSettings({ timing: m.id })}
            className={cx(
              "relative flex flex-col rounded-xl border p-4 text-left transition-colors",
              on ? "border-violet/60 bg-violet/[0.07]" : "border-line hover:border-line-strong",
            )}
          >
            <span className="flex items-center gap-3">
              <span className={cx("grid size-8 place-items-center rounded-lg", on ? "bg-violet text-on-accent" : "bg-surface-3 text-ink-muted")}>
                <m.Icon aria-hidden className="size-4" />
              </span>
              <span className="flex-1 text-base font-extrabold tracking-tight">{m.name}</span>
              <span className={cx("grid size-5 place-items-center rounded-full border-2", on ? "border-violet" : "border-line-strong")}>
                {on && <span className="size-2.5 rounded-full bg-violet" />}
              </span>
            </span>
            <span className="mt-3 text-xs leading-relaxed text-ink-muted">{m.what}</span>
            <span className="mt-1 text-[11px] text-ink-faint">{m.cost}</span>
            {rows.length > 0 && (
              <span className="mt-4 flex flex-col gap-2.5 border-t border-line pt-3.5">
                {rows.map((r) => (
                  <span key={r.targetMs} className="grid grid-cols-[3.75rem_1fr_4.25rem] items-center gap-3 text-xs">
                    <span className="font-mono text-ink-muted">{r.targetMs} ms</span>
                    <span
                      className="relative h-2 overflow-hidden rounded-full bg-surface-3"
                      title={`Average ${fmtUs(r.meanLateUs)} late, 99% within ${fmtUs(r.p99LateUs)}, worst ${fmtUs(r.maxLateUs)}`}
                    >
                      <span className="absolute inset-y-0 left-0 rounded-full bg-ink-faint/50" style={{ width: `${logPct(r.p99LateUs)}%` }} />
                      <span className={cx("absolute inset-y-0 left-0 rounded-full", m.id === "precise" ? "bg-lime" : "bg-violet")} style={{ width: `${logPct(r.meanLateUs)}%` }} />
                    </span>
                    <span className="text-right font-mono font-bold">{fmtUs(r.meanLateUs)}</span>
                  </span>
                ))}
                <span className="text-[10.5px] text-ink-faint">Average late (bright) and 99% within (dim), on a 1 µs to 2 ms scale.</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

type Row = MonitorEvent & { gap: number | null };

function Monitor() {
  const on = useStore((s) => s.status?.monitoring ?? false);
  const [events, setEvents] = useState<Row[]>([]);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!on) return;
    return backend().onMonitor((evs) => {
      setEvents((prev) => {
        const add = evs.map((e) => {
          const gap = last.current === null ? null : e.t - last.current;
          last.current = e.t;
          return { ...e, gap };
        });
        return [...add.reverse(), ...prev].slice(0, 60);
      });
    });
  }, [on]);

  useEffect(() => () => void backend().setMonitor(false), []);

  const downs = events.filter((e) => e.down);
  // The gap between two presses of the same key: how fast you really tap.
  let fastestTap: number | null = null;
  for (let i = 0; i < downs.length - 1; i++) {
    if (downs[i]!.input !== downs[i + 1]!.input) continue;
    const g = downs[i]!.t - downs[i + 1]!.t;
    if (g > 0 && (fastestTap === null || g < fastestTap)) fastestTap = g;
  }

  return (
    <Panel
      icon={<Radio aria-hidden className="size-5" />}
      title={
        <span className="flex items-center gap-3">
          Input monitor
          {on && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-lime">
              <LiveDot /> Watching
            </span>
          )}
        </span>
      }
      blurb="Every key and button event as Windows reports it, with the time since the one before. Handy for checking side buttons, or how fast you really tap."
      aside={
        <>
          {on && events.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEvents([]);
                last.current = null;
              }}
            >
              Clear
            </Button>
          )}
          <label className="flex items-center gap-2 text-sm font-bold text-ink">
            Watch
            <Switch label="Watch input" checked={on} onChange={(v) => void backend().setMonitor(v)} />
          </label>
        </>
      }
      bodyClassName="p-0"
      footer={
        on ? (
          <p className="text-xs text-ink-muted">
            MacroForge’s own output isn’t listed. Input from other programs is marked <span className="font-bold text-ink">Program</span> and your bindings ignore it, unless you
            change that in Settings.
          </p>
        ) : undefined
      }
    >
      {!on ? (
        <div className="px-6 py-5">
          <EmptyLine icon={<Activity aria-hidden className="size-5" />}>Turn on Watch, then press keys or mouse buttons anywhere.</EmptyLine>
        </div>
      ) : events.length === 0 ? (
        <div className="px-6 py-5">
          <EmptyLine icon={<Gauge aria-hidden className="size-5 animate-pulse" />}>Press something…</EmptyLine>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 border-b border-line px-6 py-4">
            <Metric label="Events" value={events.length >= 60 ? "60+" : events.length} hint="last 60 kept" />
            <Metric label="Presses" value={downs.length} hint={`${new Set(downs.map((d) => d.input)).size} different inputs`} />
            <Metric
              label="Fastest tap"
              value={fastestTap === null ? "—" : `${fastestTap.toFixed(0)}`}
              unit={fastestTap === null ? undefined : "ms"}
              tone={fastestTap === null ? "faint" : "lime"}
              hint="same key, press to press"
            />
          </div>
          <ol className="max-h-[420px] overflow-y-auto">
            {events.map((e, i) => (
              <li
                key={`${e.t}-${i}`}
                className={cx(
                  "grid grid-cols-[minmax(0,10rem)_4.5rem_5.5rem_1fr_5.5rem] items-center gap-3 border-b border-line/60 px-6 py-1.5 text-sm last:border-0",
                  i === 0 && "bg-surface-2/40",
                )}
              >
                <span className="truncate">
                  <span className="keycap">{keyName(e.input)}</span>
                </span>
                <span
                  className={cx(
                    "inline-flex w-fit items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold",
                    e.down ? "bg-lime/15 text-lime" : "bg-surface-3 text-ink-muted",
                  )}
                >
                  {e.down ? "▼ down" : "▲ up"}
                </span>
                <span className={cx("text-xs", e.injected ? "font-bold text-violet-soft" : "text-ink-muted")}>{e.injected ? "Program" : "You"}</span>
                <span className="relative h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                  {e.gap !== null && (
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-ink-faint/60"
                      style={{
                        width: `${Math.min(100, (e.gap / 250) * 100)}%`,
                      }}
                    />
                  )}
                </span>
                <span className="text-right font-mono text-xs">{e.gap === null ? "—" : `${e.gap.toFixed(1)} ms`}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Panel>
  );
}

function EmptyLine({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-line px-4 py-4 text-sm text-ink-muted">
      <span className="text-ink-faint">{icon}</span>
      {children}
    </div>
  );
}
