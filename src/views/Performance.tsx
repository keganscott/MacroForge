// Measured, not claimed: wait accuracy on this PC, the input hook's cost,
// trigger-to-output latency, and a live input monitor.

import { useEffect, useRef, useState } from "react";
import { Activity, Gauge, Play, RotateCcw } from "lucide-react";

import { Button, Callout, Card, cx, Eyebrow, PageHeader, SectionTitle, StatusBadge, Switch } from "../components/ui";
import { fmtUs } from "../lib/describe";
import { keyName } from "../lib/keys";
import type { BenchRow, MonitorEvent, Stats } from "../lib/types";
import { backend, setSettings, useStore } from "../store";

export function PerformanceView() {
  const status = useStore((s) => s.status)!;
  const timing = useStore((s) => s.data!.settings.timing);
  const [stats, setStats] = useState<Stats | null>(null);
  const [bench, setBench] = useState<BenchRow[] | null>(null);
  const [benching, setBenching] = useState(false);

  useEffect(() => {
    const load = () => void backend().getStats().then(setStats);
    load();
    const t = setInterval(load, 1000);
    return () => clearInterval(t);
  }, []);

  const runBench = async () => {
    setBenching(true);
    try {
      setBench(await backend().runBenchmark());
    } finally {
      setBenching(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Performance"
        description="Numbers measured on this PC while MacroForge runs. Nothing here is an estimate."
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <Eyebrow>Engine</Eyebrow>
          <dl className="mt-3 space-y-2.5 text-sm">
            <Row label="Keyboard hook">
              <StatusBadge tone={status.hook.keyboard ? "ok" : "bad"}>{status.hook.keyboard ? "Installed" : "Not installed"}</StatusBadge>
            </Row>
            <Row label="Mouse hook">
              <StatusBadge tone={status.hook.mouse ? "ok" : "neutral"}>{status.hook.mouse ? "Installed" : "Off (not needed)"}</StatusBadge>
            </Row>
            <Row label="Runs as administrator">
              <span className="font-bold">{status.selfElevated ? "Yes" : "No"}</span>
            </Row>
            <Row label="Timing mode">
              <span className="font-bold capitalize">{timing}</span>
            </Row>
          </dl>
          <p className="mt-4 text-xs text-ink-muted">
            The mouse hook is only installed while a binding, the recorder or the monitor needs mouse buttons, so a keyboard-only setup adds nothing to your mouse's path.
          </p>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <Eyebrow>Since start</Eyebrow>
            <Button size="sm" variant="ghost" icon={<RotateCcw aria-hidden className="size-3.5" />} onClick={() => void backend().resetStats()}>
              Reset
            </Button>
          </div>
          <dl className="mt-3 space-y-2.5 text-sm">
            <Row label="Input events seen">{stats ? stats.hookEvents.toLocaleString() : "—"}</Row>
            <Row label="Hook time, average">{stats?.hookEvents ? fmtUs(stats.hookAvgUs) : "—"}</Row>
            <Row label="Hook time, slowest">{stats?.hookEvents ? fmtUs(stats.hookMaxUs) : "—"}</Row>
            <Row label="Sends Windows refused">
              <span className={cx("font-mono", stats?.sendFailures ? "font-bold text-bad" : "")}>{stats?.sendFailures ?? "—"}</span>
            </Row>
          </dl>
        </Card>
        <Card>
          <Eyebrow>Trigger to first output</Eyebrow>
          <dl className="mt-3 space-y-2.5 text-sm">
            <Row label="Median">{stats?.latencySamples ? fmtUs(stats.latencyP50Us) : "—"}</Row>
            <Row label="99th percentile">{stats?.latencySamples ? fmtUs(stats.latencyP99Us) : "—"}</Row>
            <Row label="Slowest">{stats?.latencySamples ? fmtUs(stats.latencyMaxUs) : "—"}</Row>
            <Row label="Samples">{stats?.latencySamples ?? 0}</Row>
          </dl>
          <p className="mt-4 text-xs text-ink-muted">From the moment Windows hands MacroForge your key press to the moment its first output is sent. Use a binding a few times to fill this in.</p>
        </Card>
      </div>

      <div className="mt-8">
        <SectionTitle
          aside={
            <Button size="sm" variant="primary" busy={benching} icon={<Play aria-hidden className="size-3.5" />} onClick={() => void runBench()}>
              {bench ? "Run again" : "Run timing test"}
            </Button>
          }
        >
          Timing test
        </SectionTitle>
        <Card>
          <p className="text-sm text-ink-muted">
            Asks for waits of 1, 5 and 16.7 ms many times in each timing mode and records how late each one ended. Takes about five seconds. Close heavy apps first for a fair reading.
          </p>
          {bench && (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-faint">
                  <th className="py-2 font-bold">Mode</th>
                  <th className="py-2 font-bold">Asked for</th>
                  <th className="py-2 text-right font-bold">Late on average</th>
                  <th className="py-2 text-right font-bold">99% within</th>
                  <th className="py-2 text-right font-bold">Worst</th>
                </tr>
              </thead>
              <tbody>
                {bench.map((r, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-2 font-bold">{r.label}</td>
                    <td className="py-2 font-mono">{r.targetMs} ms</td>
                    <td className="py-2 text-right font-mono">{fmtUs(r.meanLateUs)}</td>
                    <td className="py-2 text-right font-mono">{fmtUs(r.p99LateUs)}</td>
                    <td className="py-2 text-right font-mono">{fmtUs(r.maxLateUs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <span className="text-sm font-bold">Use</span>
            <button type="button" onClick={() => setSettings({ timing: "precise" })} className={cx("rounded-lg border px-3 py-2 text-left text-xs", timing === "precise" ? "border-violet bg-violet/15" : "border-line")}>
              <span className="block text-sm font-bold text-ink">Precise</span>
              Timer, then a short spin to the exact moment. Uses a little CPU while a macro waits.
            </button>
            <button type="button" onClick={() => setSettings({ timing: "efficient" })} className={cx("rounded-lg border px-3 py-2 text-left text-xs", timing === "efficient" ? "border-violet bg-violet/15" : "border-line")}>
              <span className="block text-sm font-bold text-ink">Efficient</span>
              Timer only. Least CPU; waits can end a fraction of a millisecond late.
            </button>
          </div>
        </Card>
      </div>

      <Monitor />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-mono">{children}</dd>
    </div>
  );
}

function Monitor() {
  const on = useStore((s) => s.status?.monitoring ?? false);
  const [events, setEvents] = useState<(MonitorEvent & { gap: number | null })[]>([]);
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

  return (
    <div className="mt-8">
      <SectionTitle
        aside={
          <label className="flex items-center gap-2 text-sm font-bold text-ink">
            Watch input
            <Switch label="Watch input" checked={on} onChange={(v) => void backend().setMonitor(v)} />
          </label>
        }
      >
        Input monitor
      </SectionTitle>
      <Card className="p-0">
        {!on ? (
          <div className="flex items-center gap-3 p-5 text-sm text-ink-muted">
            <Activity aria-hidden className="size-5" />
            Shows every key and button event as Windows reports it, with the time since the one before. Useful to check a mouse's side buttons, or how fast you really tap.
          </div>
        ) : events.length === 0 ? (
          <div className="flex items-center gap-3 p-5 text-sm text-ink-muted">
            <Gauge aria-hidden className="size-5 animate-pulse" /> Press something…
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-faint">
                <th className="px-5 py-2 font-bold">Input</th>
                <th className="py-2 font-bold">Event</th>
                <th className="py-2 font-bold">Source</th>
                <th className="px-5 py-2 text-right font-bold">Since previous</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={`${e.t}-${i}`} className="border-t border-line">
                  <td className="px-5 py-1.5">
                    <span className="keycap">{keyName(e.input)}</span>
                  </td>
                  <td className={cx("py-1.5 font-bold", e.down ? "text-lime" : "text-ink-muted")}>{e.down ? "down" : "up"}</td>
                  <td className="py-1.5 text-xs text-ink-muted">{e.injected ? "another program" : "you"}</td>
                  <td className="px-5 py-1.5 text-right font-mono">{e.gap === null ? "—" : `${e.gap.toFixed(1)} ms`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {on && (
        <p className="mt-2 text-xs text-ink-muted">
          MacroForge's own output is not listed. Input sent by other programs shows as "another program"{" "}
          <span className="text-ink">and is ignored by your bindings</span> unless you change that in Settings.
        </p>
      )}
      <div className="mt-4">
        <Callout tone="info" title="Fewer surprises in games">
          Run games in borderless or windowed fullscreen for the on-screen notice to show. If a game runs as administrator, MacroForge must too (Home shows a button when that happens).
        </Callout>
      </div>
    </div>
  );
}
