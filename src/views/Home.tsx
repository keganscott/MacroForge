import { useEffect, useState } from "react";
import { ArrowRight, Gauge, Keyboard, ListVideo, Lock, MousePointerClick, ShieldAlert, Square, Wand2 } from "lucide-react";

import { Facets } from "../components/brand";
import { MasterSwitch, useNavigate } from "../components/Shell";
import { Button, Callout, Card, cx, Eyebrow, Keycap, LiveDot, SectionTitle, StatusBadge } from "../components/ui";
import { actionSummary, bindingTitle, fmtUs } from "../lib/describe";
import { comboName } from "../lib/keys";
import type { Binding, Stats } from "../lib/types";
import { backend, useStore } from "../store";

export function HomeView() {
  const data = useStore((s) => s.data)!;
  const status = useStore((s) => s.status)!;
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const load = () => void backend().getStats().then(setStats);
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  const active = data.profiles.filter((p) => status.activeProfiles.includes(p.id));
  const gameProfiles = active.filter((p) => p.apps.length);
  const total = data.profiles.reduce((n, p) => n + p.bindings.length, 0);
  const lockBindings: Binding[] = data.profiles.flatMap((p) => p.bindings).filter((b) => status.locks.includes(b.id));
  const s = data.settings;
  const elevatedProblem = status.foregroundElevated === true && !status.selfElevated;

  const headline = !status.armed
    ? "Bindings are off."
    : status.liveBindings === 0
      ? total === 0
        ? "Ready when you are."
        : "Nothing applies to this app."
      : null;

  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <Eyebrow>Home</Eyebrow>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight">
            {headline ?? (
              <>
                <span className="text-lime">{status.liveBindings}</span> binding{status.liveBindings === 1 ? "" : "s"} live.
              </>
            )}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {active.map((p) => p.name).join(" + ") || "No profile"} · in front: <span className="font-mono">{status.foreground ?? "desktop"}</span>
          </p>
        </div>
      </div>

      {elevatedProblem && (
        <div className="mb-5">
          <Callout
            tone="warn"
            title={`${status.foreground ?? "The app in front"} runs as administrator, so Windows blocks MacroForge's input to it.`}
            action={
              <Button variant="primary" icon={<ShieldAlert aria-hidden className="size-4" />} onClick={() => void backend().relaunchAdmin()}>
                Restart MacroForge as administrator
              </Button>
            }
          >
            Windows only lets a program send input to apps running at the same level or lower. Restarting MacroForge as administrator fixes it for this session.
          </Callout>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* ------------------------------------------------ hero */}
        <section className={cx("relative overflow-hidden rounded-2xl p-7", status.armed ? "bg-violet" : "border border-line bg-surface-1")}>
          {status.armed && <Facets className="pointer-events-none absolute inset-y-0 right-0 h-full w-2/3" />}
          <div className="relative">
            <Eyebrow className={status.armed ? "text-white/80" : ""}>{status.armed ? "Armed" : "Paused"}</Eyebrow>
            <h2 className="mt-2 max-w-md text-2xl font-extrabold tracking-tight text-white">
              {status.armed
                ? status.pausedOwnWindow
                  ? "On. Bindings pause while this window is in front, so you can type here."
                  : "Your bindings are listening."
                : "Nothing will run until you switch bindings on."}
            </h2>
            <p className={cx("mt-2 max-w-md text-sm", status.armed ? "text-white/80" : "text-ink-muted")}>
              {s.masterHotkey.input ? (
                <>
                  <span className="font-bold">{comboName(s.masterHotkey.input, s.masterHotkey.mods)}</span> switches them on or off from inside any game.{" "}
                </>
              ) : null}
              {s.panicHotkey.input ? (
                <>
                  <span className="font-bold">{comboName(s.panicHotkey.input, s.panicHotkey.mods)}</span> stops everything instantly.
                </>
              ) : null}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <MasterSwitch large />
              {total === 0 && (
                <Button variant={status.armed ? "go" : "primary"} icon={<Wand2 aria-hidden className="size-4" />} onClick={() => navigate({ view: "tools" })}>
                  Set up a quick tool
                </Button>
              )}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ running */}
        <Card className="flex flex-col texture-lines">
          <div className="flex items-center justify-between">
            <Eyebrow>Running now</Eyebrow>
            {status.running.length + status.locks.length > 0 && (
              <Button size="sm" variant="danger" icon={<Square aria-hidden className="size-3.5" />} onClick={() => void backend().panicStop()}>
                Stop all
              </Button>
            )}
          </div>
          {status.running.length + status.locks.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">Nothing is running. Toggles, held keys and playing macros show here.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {status.running.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  <LiveDot />
                  <span className="flex-1 truncate font-bold">{r.label}</span>
                  <span className="text-xs text-ink-muted">{r.mode === "toggle" ? "toggled on" : r.mode === "hold" ? "held" : "playing"}</span>
                  <button type="button" aria-label={`Stop ${r.label}`} onClick={() => void backend().stopRun(r.id)} className="rounded p-1 text-ink-muted hover:bg-surface-3 hover:text-bad">
                    <Square aria-hidden className="size-3.5" />
                  </button>
                </li>
              ))}
              {lockBindings.map((b) => (
                <li key={b.id} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  <Lock aria-hidden className="size-3.5 text-lime" />
                  <span className="flex-1 truncate font-bold">{bindingTitle(b, data.macros)}</span>
                  <span className="text-xs text-ink-muted">holding</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-auto grid grid-cols-2 gap-3 pt-5">
            <Metric label="Trigger to output" value={stats && stats.latencySamples ? fmtUs(stats.latencyP50Us) : "—"} hint="median, measured" />
            <Metric label="Hook time per event" value={stats && stats.hookEvents ? fmtUs(stats.hookAvgUs) : "—"} hint="average, measured" />
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------ live bindings */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <SectionTitle aside={<button type="button" onClick={() => navigate({ view: "bindings" })} className="font-bold text-ink hover:underline">All bindings →</button>}>
            Live in {gameProfiles.length ? gameProfiles.map((p) => p.name).join(", ") : "this app"}
          </SectionTitle>
          <Card className="p-2">
            {active.flatMap((p) => p.bindings.filter((b) => b.enabled && b.trigger.input)).length === 0 ? (
              <p className="p-4 text-sm text-ink-muted">No bindings apply here yet.</p>
            ) : (
              <ul>
                {active.flatMap((p) =>
                  p.bindings
                    .filter((b) => b.enabled && b.trigger.input)
                    .slice(0, 12)
                    .map((b) => (
                      <li key={b.id} className="flex items-center gap-4 rounded-lg px-3 py-2.5 hover:bg-surface-2">
                        <span className="w-40 shrink-0">
                          <Keycap input={b.trigger.input} mods={b.trigger.mods} />
                        </span>
                        <ArrowRight aria-hidden className="size-4 text-ink-faint" />
                        <span className="flex-1 truncate text-sm font-semibold">{bindingTitle(b, data.macros)}</span>
                        <span className="hidden truncate text-xs text-ink-muted xl:block">{b.name ? actionSummary(b.action, data.macros) : ""}</span>
                        {p.apps.length > 0 && <StatusBadge tone="info" icon={false}>{p.name}</StatusBadge>}
                      </li>
                    )),
                )}
              </ul>
            )}
          </Card>
        </div>
        <div>
          <SectionTitle>Start here</SectionTitle>
          <div className="flex flex-col gap-2">
            <Shortcut icon={<MousePointerClick aria-hidden className="size-4" />} title="Auto-clicker, turbo, remap" hint="Quick tools: two clicks each" onClick={() => navigate({ view: "tools" })} />
            <Shortcut icon={<ListVideo aria-hidden className="size-4" />} title="Record a macro" hint="Do it once, replay it on a key" onClick={() => navigate({ view: "macros" })} />
            <Shortcut icon={<Keyboard aria-hidden className="size-4" />} title="Per-game profiles" hint="Switch automatically with the game in front" onClick={() => navigate({ view: "bindings" })} />
            <Shortcut icon={<Gauge aria-hidden className="size-4" />} title="Check timing on this PC" hint="Measure, don't guess" onClick={() => navigate({ view: "performance" })} />
          </div>
        </div>
      </div>
    </>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-1 p-3">
      <p className="text-[11px] font-bold text-ink-faint">{label}</p>
      <p className="mt-1 font-mono text-xl font-bold text-ink">{value}</p>
      <p className="text-[11px] text-ink-faint">{hint}</p>
    </div>
  );
}

function Shortcut({ icon, title, hint, onClick }: { icon: React.ReactNode; title: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex items-center gap-3 rounded-xl border border-line bg-surface-1 p-3 text-left hover:border-violet">
      <span className="grid size-9 place-items-center rounded-lg bg-surface-3 text-violet-soft group-hover:bg-violet group-hover:text-white">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-bold">{title}</span>
        <span className="text-xs text-ink-muted">{hint}</span>
      </span>
      <ArrowRight aria-hidden className="size-4 text-ink-faint group-hover:text-ink" />
    </button>
  );
}
