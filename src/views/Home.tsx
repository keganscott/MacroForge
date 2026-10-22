import { useState } from "react";
import { ArrowRight, CircleCheck, Gamepad2, Gauge, Keyboard, ListVideo, Lock, MousePointerClick, ShieldAlert, Square, Volume2, VolumeX, Wand2 } from "lucide-react";

import { SignalTrace } from "../components/brand";
import { MasterSwitch, useNavigate } from "../components/Shell";
import { Button, Callout, Card, cx, Eyebrow, Keycap, LiveDot, SectionTitle, StatusBadge } from "../components/ui";
import { actionSummary, bindingTitle, fmtUs } from "../lib/describe";
import { comboName } from "../lib/keys";
import { useActive, useActiveInterval } from "../lib/active";
import type { Binding, Stats } from "../lib/types";
import { backend, flushNow, setSettings, useStore } from "../store";

export function HomeView() {
  const data = useStore((s) => s.data)!;
  const status = useStore((s) => s.status)!;
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);

  const focused = useActive();
  useActiveInterval(() => void backend().getStats().then(setStats), 3000);

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
        : status.pausedOwnWindow
          ? `${total} binding${total === 1 ? "" : "s"} ready.`
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
            {status.pausedOwnWindow ? (
              "Paused while MacroForge is in front. Switch to a game or app and they apply there."
            ) : (
              <>
                {active.map((p) => p.name).join(" + ") || "No profile"} · in front: <span className="font-mono">{status.foreground ?? "desktop"}</span>
              </>
            )}
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
        <section
          className={cx(
            "relative overflow-hidden rounded-2xl border bg-surface-1 p-7 pb-28 texture-grid",
            status.armed ? "border-violet/50" : "border-line",
          )}
          style={status.armed ? { boxShadow: "0 0 70px -28px var(--color-violet), inset 0 1px 0 rgb(255 255 255 / 0.04)" } : undefined}
        >
          {status.armed && (
            <div aria-hidden className="pointer-events-none absolute -top-24 -left-16 size-72 rounded-full opacity-25 blur-3xl" style={{ background: "var(--color-violet)" }} />
          )}
          <SignalTrace live={status.armed && !status.pausedOwnWindow && focused} className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full" />
          <div className="relative">
            <p className={cx("flex items-center gap-2 text-[10.5px] font-bold tracking-[0.14em] uppercase", status.armed ? "text-violet" : "text-ink-faint")}>
              {status.armed ? <LiveDot /> : <span aria-hidden className="size-2 rounded-full bg-ink-faint" />}
              {!status.armed ? "Paused" : status.pausedOwnWindow ? "On · paused in this window" : "Listening"}
            </p>
            <h2 className="mt-3 max-w-lg text-2xl font-extrabold tracking-tight">
              {status.armed
                ? status.pausedOwnWindow
                  ? "Switch to your game and your bindings take over."
                  : "Your bindings are listening."
                : "Nothing will run until you switch bindings on."}
            </h2>
            <p className="mt-2 flex max-w-lg flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-ink-muted">
              {s.masterHotkey.input ? (
                <>
                  <Keycap input={s.masterHotkey.input} mods={s.masterHotkey.mods} /> on / off
                </>
              ) : null}
              {s.panicHotkey.input ? (
                <>
                  <span className="mx-1 text-ink-faint">·</span>
                  <Keycap input={s.panicHotkey.input} mods={s.panicHotkey.mods} /> stops everything
                </>
              ) : null}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <MasterSwitch large />
              <QuickToggle
                on={!s.sounds}
                onClick={() => setSettings({ sounds: !s.sounds })}
                icon={s.sounds ? <Volume2 aria-hidden className="size-4" /> : <VolumeX aria-hidden className="size-4" />}
                title={s.sounds ? "Mute sounds" : "Sounds muted"}
                hint="No click when anything turns on or off"
              />
              <QuickToggle
                on={s.hudStealth}
                onClick={() => {
                  const hudStealth = !s.hudStealth;
                  setSettings({ hudStealth, ...(hudStealth ? { hud: true } : {}) });
                  // Show what it looks like now.
                  void flushNow().then(() => backend().previewHud());
                }}
                icon={<CircleCheck aria-hidden className="size-4" />}
                title={s.hudStealth ? "Stealth notice on" : "Stealth notice"}
                hint="Just a small ✓ or ✕ on screen instead of the full notice"
              />
              {total === 0 && (
                <Button variant="primary" icon={<Wand2 aria-hidden className="size-4" />} onClick={() => navigate({ view: "tools" })}>
                  Set up a quick tool
                </Button>
              )}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ running */}
        <Card className="flex flex-col">
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
                        <span className={cx("flex-1 truncate text-sm font-semibold", status.muted?.includes(b.id) && "text-ink-faint line-through")}>{bindingTitle(b, data.macros)}</span>
                        {status.muted?.includes(b.id) && (
                          <span className="rounded-md border border-line-strong px-1.5 py-px text-[11px] font-bold text-ink-muted">
                            Off{b.toggleKey?.input ? ` · ${comboName(b.toggleKey.input, b.toggleKey.mods)} turns it on` : ""}
                          </span>
                        )}
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
          <ActivityCard />
          <SectionTitle>Start here</SectionTitle>
          <div className="flex flex-col gap-2">
            <Shortcut icon={<MousePointerClick aria-hidden className="size-4" />} title="Auto-clicker, turbo, remap" hint="Quick tools: two clicks each" onClick={() => navigate({ view: "tools" })} />
            <Shortcut icon={<Gamepad2 aria-hidden className="size-4" />} title="Game presets" hint="ARC Raiders, Fortnite, Minecraft, Stardew Valley" onClick={() => navigate({ view: "presets" })} />
            <Shortcut icon={<ListVideo aria-hidden className="size-4" />} title="Record a macro" hint="Do it once, replay it on a key" onClick={() => navigate({ view: "macros" })} />
            <Shortcut icon={<Keyboard aria-hidden className="size-4" />} title="Per-game profiles" hint="Switch automatically with the game in front" onClick={() => navigate({ view: "bindings" })} />
            <Shortcut icon={<Gauge aria-hidden className="size-4" />} title="Check timing on this PC" hint="Measure, don't guess" onClick={() => navigate({ view: "performance" })} />
          </div>
        </div>
      </div>
    </>
  );
}

/** A small on / off pill for a setting, next to the master switch. */
function QuickToggle({ on, onClick, icon, title, hint }: { on: boolean; onClick: () => void; icon: React.ReactNode; title: string; hint: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={hint}
      onClick={onClick}
      className={cx(
        "inline-flex h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-bold transition-colors",
        on ? "border-violet/60 bg-violet/15 text-ink" : "border-line-strong bg-surface-1/80 text-ink-muted hover:border-ink-faint hover:text-ink",
      )}
    >
      <span className={on ? "text-violet" : undefined}>{icon}</span>
      {title}
    </button>
  );
}

function ActivityCard() {
  const activity = useStore((s) => s.activity);
  const [, tick] = useState(0);
  useActiveInterval(() => tick((n) => n + 1), 10_000);
  return (
    <div className="mb-6">
      <SectionTitle>Activity</SectionTitle>
      <Card className="p-2">
        {activity.length === 0 ? (
          <p className="p-3 text-sm text-ink-muted">Toggles, on / off and game profile switches show here as they happen.</p>
        ) : (
          <ul>
            {activity.slice(0, 7).map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm">
                <span aria-hidden className={cx("size-2 shrink-0 rounded-full", a.on ? "bg-lime" : "bg-ink-faint")} />
                <span className="flex-1 truncate font-semibold">{a.text}</span>
                <span className="text-xs text-ink-faint tabular-nums">{ago(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ago(at: number): string {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
      <span className="grid size-9 place-items-center rounded-lg bg-surface-3 text-violet-soft group-hover:bg-violet group-hover:text-on-accent">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-bold">{title}</span>
        <span className="text-xs text-ink-muted">{hint}</span>
      </span>
      <ArrowRight aria-hidden className="size-4 text-ink-faint group-hover:text-ink" />
    </button>
  );
}
