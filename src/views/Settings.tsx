import { FolderOpen, MonitorSmartphone, Play, ShieldCheck, Volume1, Volume2 } from "lucide-react";

import { KeyField } from "../components/KeyField";
import { Button, Card, cx, Field, PageHeader, Segmented, SectionTitle, Slider, SwitchRow } from "../components/ui";
import type { Accent, HudPosition, SoundStyle } from "../lib/types";
import { MOUSE_LEFT, MOUSE_RIGHT } from "../lib/keys";
import { backend, flushNow, setSettings, toast, useStore } from "../store";

const ACCENTS: { id: Accent; color: string }[] = [
  { id: "signal", color: "#22d3ee" },
  { id: "violet", color: "#7e3bed" },
  { id: "blue", color: "#2563eb" },
  { id: "teal", color: "#0d9488" },
  { id: "green", color: "#16a34a" },
  { id: "amber", color: "#d97706" },
  { id: "pink", color: "#db2777" },
];

/** Save pending edits first, so the test plays the style and volume shown. */
async function testSound(on: boolean) {
  await flushNow();
  await backend().testSound(on);
}

const windowsReducesMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Left / right click would take over every normal click, so they are refused here. */
function setHotkey(which: "masterHotkey" | "panicHotkey", hk: { input: number; mods: number }) {
  if (hk.input === MOUSE_LEFT || hk.input === MOUSE_RIGHT) {
    toast("Left and right click can’t be a hotkey: every click would toggle it. Try a key or Mouse 4 / 5.");
    return;
  }
  setSettings({ [which]: hk });
}

export function SettingsView() {
  const s = useStore((st) => st.data!.settings);
  const dir = useStore((st) => st.dataDir);
  const version = useStore((st) => st.version);
  const elevated = useStore((st) => st.status?.selfElevated ?? false);

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-6">
          <section>
            <SectionTitle>Hotkeys</SectionTitle>
            <Card className="flex flex-col gap-5">
              <Field label="Switch all bindings on / off" hint="Works in any app, even while bindings are off. Scroll Lock by default: its keyboard light shows the state on many keyboards.">
                <KeyField label="Master hotkey" value={s.masterHotkey} onChange={(masterHotkey) => setHotkey("masterHotkey", masterHotkey)} quick={[]} />
              </Field>
              <Field label="Stop everything" hint="Stops every running macro, rapid fire and held key at once, and lets go of anything MacroForge is holding down.">
                <KeyField label="Stop-all hotkey" value={s.panicHotkey} onChange={(panicHotkey) => setHotkey("panicHotkey", panicHotkey)} quick={[]} />
              </Field>
            </Card>
          </section>

          <section>
            <SectionTitle>Behaviour</SectionTitle>
            <Card className="divide-y divide-line py-2">
              <SwitchRow title="Bindings on when MacroForge opens" checked={s.armedOnLaunch} onChange={(armedOnLaunch) => setSettings({ armedOnLaunch })} />
              <SwitchRow
                title="Ignore input from other programs"
                hint="On-screen keyboards and other macro tools will not set off your bindings."
                checked={s.ignoreForeignInjected}
                onChange={(ignoreForeignInjected) => setSettings({ ignoreForeignInjected })}
              />
              <SwitchRow title="Start with Windows" hint="Opens in the tray when you sign in (your user's Run key only)." checked={s.startWithWindows} onChange={(startWithWindows) => setSettings({ startWithWindows })} />
              <SwitchRow title="Start minimized to the tray" checked={s.startMinimized} onChange={(startMinimized) => setSettings({ startMinimized })} />
              <SwitchRow title="Closing the window keeps MacroForge in the tray" hint="Your bindings keep working. Quit from the tray icon." checked={s.closeToTray} onChange={(closeToTray) => setSettings({ closeToTray })} />
            </Card>
          </section>

          <section>
            <SectionTitle>Timing</SectionTitle>
            <Card>
              <Segmented
                label="Timing mode"
                value={s.timing}
                onChange={(timing) => setSettings({ timing })}
                options={[
                  { value: "precise", label: "Precise" },
                  { value: "efficient", label: "Efficient" },
                ]}
              />
              <p className="mt-3 text-xs text-ink-muted">
                Precise waits on a high-resolution timer, then spins for the last 0.8 ms: presses within a few µs, at about 2–3 % of one CPU core while a macro or rapid fire is running (none when idle). Efficient uses the timer alone: about 0 % CPU, presses up to ~0.6 ms late. Compare both on this PC in Performance.
              </p>
            </Card>
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section>
            <SectionTitle>On-screen notice</SectionTitle>
            <Card className="flex flex-col gap-4">
              <div className="divide-y divide-line">
                <SwitchRow title="Show a notice when a toggle changes" hint="A small line over your game: “Auto-clicker on”. It never takes focus and clicks pass through it." checked={s.hud} onChange={(hud) => setSettings({ hud })} />
              </div>
              <Field label="Position">
                <div className="flex flex-wrap items-center gap-3">
                  <Segmented<HudPosition>
                    size="sm"
                    label="Position"
                    value={s.hudPosition}
                    onChange={(hudPosition) => setSettings({ hudPosition })}
                    options={[
                      { value: "topLeft", label: "Top left" },
                      { value: "topCenter", label: "Top" },
                      { value: "topRight", label: "Top right" },
                      { value: "bottomLeft", label: "Bottom left" },
                      { value: "bottomRight", label: "Bottom right" },
                    ]}
                  />
                  <Button size="sm" icon={<MonitorSmartphone aria-hidden className="size-3.5" />} onClick={() => void backend().previewHud()}>
                    Preview
                  </Button>
                </div>
              </Field>
            </Card>
          </section>

          <section>
            <SectionTitle>Sounds</SectionTitle>
            <Card className="flex flex-col gap-4">
              <SwitchRow title="Play a sound when something switches" hint="Quiet by design: a cue you feel more than hear." checked={s.sounds} onChange={(sounds) => setSettings({ sounds })} />
              <div className={cx("flex flex-col gap-4", !s.sounds && "pointer-events-none opacity-40")}>
                <Field label="Sound">
                  <Segmented<SoundStyle>
                    size="sm"
                    label="Sound"
                    value={s.soundStyle}
                    onChange={(soundStyle) => setSettings({ soundStyle })}
                    options={[
                      { value: "click", label: "Soft click" },
                      { value: "chime", label: "Glass chime" },
                      { value: "pop", label: "Pop" },
                    ]}
                  />
                </Field>
                <Field label={`Volume · ${s.soundVolume}%`}>
                  <div className="flex items-center gap-3">
                    <Volume1 aria-hidden className="size-4 shrink-0 text-ink-faint" />
                    <Slider label="Volume" min={5} max={100} step={5} value={s.soundVolume} onChange={(soundVolume) => setSettings({ soundVolume })} />
                    <Volume2 aria-hidden className="size-4 shrink-0 text-ink-faint" />
                  </div>
                </Field>
                <div className="flex gap-2">
                  <Button size="sm" icon={<Play aria-hidden className="size-3.5" />} onClick={() => void testSound(true)}>
                    Hear "on"
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void testSound(false)}>
                    Hear "off"
                  </Button>
                </div>
              </div>
            </Card>
          </section>

          <section>
            <SectionTitle>Appearance</SectionTitle>
            <Card>
              <p className="mb-3 text-xs font-bold">Accent colour</p>
              <div className="flex gap-2">
                {ACCENTS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    aria-label={a.id}
                    aria-pressed={s.accent === a.id}
                    onClick={() => setSettings({ accent: a.id })}
                    className={cx("size-9 rounded-full border-2", s.accent === a.id ? "border-white" : "border-transparent")}
                    style={{ background: a.color }}
                  />
                ))}
              </div>
              <p className="mt-5 mb-2 text-xs font-bold">Animations</p>
              <Segmented
                size="sm"
                label="Animations"
                value={s.motion ?? "full"}
                onChange={(motion) => setSettings({ motion })}
                options={[
                  { value: "full", label: "On" },
                  { value: "system", label: "Follow Windows" },
                  { value: "off", label: "Off" },
                ]}
              />
              <p className="mt-2 text-xs text-ink-muted">
                {windowsReducesMotion
                  ? "Windows’ Animation effects are off on this PC. “Follow Windows” would switch MacroForge’s animations off too."
                  : "The on / off moment, the signal trace and the live pulses. They pause whenever MacroForge is in the background."}
              </p>
              <p className="mt-4 text-xs text-ink-muted">Signal cyan is MacroForge’s own; the others are the family colours shared with PeakTweaks and Crosshair Forge. Lime always means on.</p>
            </Card>
          </section>

          <section>
            <SectionTitle>Your data</SectionTitle>
            <Card className="flex flex-col gap-3">
              <p className="text-sm text-ink-muted">
                Everything is saved as you go to <span className="font-mono text-ink">{dir}</span>, with a backup of the previous save. Share single profiles from Bindings.
              </p>
              <div>
                <Button size="sm" icon={<FolderOpen aria-hidden className="size-3.5" />} onClick={() => void backend().openDataDir()}>
                  Open data folder
                </Button>
              </div>
            </Card>
          </section>

          <section>
            <SectionTitle>How MacroForge works</SectionTitle>
            <Card className="flex gap-3">
              <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-lime" />
              <div className="space-y-2 text-sm text-ink-muted">
                <p>
                  It watches keys through Windows' standard input hooks and sends input with <span className="font-mono text-ink">SendInput</span>, the same documented way on-screen keyboards do. No driver, nothing injected into any game, nothing hidden, no network access.
                </p>
                <p className="text-xs">
                  Version {version}
                  {elevated ? " · running as administrator" : ""}
                </p>
              </div>
            </Card>
          </section>
        </div>
      </div>
    </>
  );
}
