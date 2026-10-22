// Settings: a section launcher on the left (each with its current value), and
// one panel per section on the right, in the same frame as Performance.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, FolderOpen, Info, Keyboard, MonitorSmartphone, Octagon, Palette, Play, Power, ShieldCheck, SlidersHorizontal, Timer, Volume1, Volume2 } from "lucide-react";

import { KeyField } from "../components/KeyField";
import { Panel } from "../components/Panel";
import { Button, cx, Segmented, Slider, Switch, SwitchRow } from "../components/ui";
import { comboName, MOUSE_LEFT, MOUSE_RIGHT } from "../lib/keys";
import type { Accent, HudPosition, Settings, SoundStyle } from "../lib/types";
import { useNavigate } from "../components/Shell";
import { backend, flushNow, setSettings, toast, useStore } from "../store";
import { TimingModes } from "./Performance";

const ACCENTS: { id: Accent; name: string; color: string }[] = [
  { id: "signal", name: "Signal", color: "#22d3ee" },
  { id: "violet", name: "Violet", color: "#7e3bed" },
  { id: "blue", name: "Blue", color: "#2563eb" },
  { id: "teal", name: "Teal", color: "#0d9488" },
  { id: "green", name: "Green", color: "#16a34a" },
  { id: "amber", name: "Amber", color: "#d97706" },
  { id: "pink", name: "Pink", color: "#db2777" },
];

const SOUNDS: { id: SoundStyle; name: string; what: string }[] = [
  { id: "click", name: "Soft click", what: "A short, dry tick" },
  { id: "chime", name: "Glass chime", what: "Two light notes" },
  { id: "pop", name: "Pop", what: "Round and quick" },
];

const HUD_SPOTS: { id: HudPosition; name: string; x: string; y: string }[] = [
  { id: "topLeft", name: "Top left", x: "left-[6%]", y: "top-[9%]" },
  { id: "topCenter", name: "Top", x: "left-1/2 -translate-x-1/2", y: "top-[9%]" },
  { id: "topRight", name: "Top right", x: "right-[6%]", y: "top-[9%]" },
  { id: "bottomLeft", name: "Bottom left", x: "left-[6%]", y: "bottom-[9%]" },
  { id: "bottomRight", name: "Bottom right", x: "right-[6%]", y: "bottom-[9%]" },
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

type SectionId = "hotkeys" | "behaviour" | "timing" | "notice" | "sounds" | "appearance" | "data" | "about";

const SECTIONS: { id: SectionId; name: string; Icon: typeof Keyboard; value: (s: Settings) => string }[] = [
  {
    id: "hotkeys",
    name: "Hotkeys",
    Icon: Keyboard,
    value: (s) => `${comboName(s.masterHotkey.input, s.masterHotkey.mods)} · ${comboName(s.panicHotkey.input, s.panicHotkey.mods)}`,
  },
  { id: "behaviour", name: "Behaviour", Icon: SlidersHorizontal, value: (s) => (s.startWithWindows ? "Starts with Windows" : "Starts when you open it") },
  { id: "timing", name: "Timing", Icon: Timer, value: (s) => (s.timing === "precise" ? "Precise" : "Efficient") },
  { id: "notice", name: "On-screen notice", Icon: MonitorSmartphone, value: (s) => (s.hud ? `${s.hudStealth ? "Stealth · " : ""}${HUD_SPOTS.find((h) => h.id === s.hudPosition)?.name ?? "On"}` : "Off") },
  { id: "sounds", name: "Sounds", Icon: Volume2, value: (s) => (s.sounds ? `${SOUNDS.find((x) => x.id === s.soundStyle)?.name} · ${s.soundVolume}%` : "Off") },
  {
    id: "appearance",
    name: "Appearance",
    Icon: Palette,
    value: (s) => `${ACCENTS.find((a) => a.id === s.accent)?.name ?? "Signal"} · animations ${s.motion === "off" ? "off" : s.motion === "system" ? "follow Windows" : "on"}`,
  },
  { id: "data", name: "Your data", Icon: FolderOpen, value: () => "Saved as you go" },
  { id: "about", name: "About", Icon: Info, value: () => "How MacroForge works" },
];

export function SettingsView() {
  const s = useStore((st) => st.data!.settings);
  const navigate = useNavigate();
  const [active, setActive] = useState<SectionId>("hotkeys");
  const refs = useRef(new Map<SectionId, HTMLElement>());
  // While a clicked jump scrolls, keep the clicked section lit.
  const lockUntil = useRef(0);

  // Light up the section being read: the top-most one in view.
  useEffect(() => {
    const seen = new Map<SectionId, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id.replace("set-", "") as SectionId, e.isIntersecting);
        const first = SECTIONS.find((x) => seen.get(x.id));
        if (first && Date.now() > lockUntil.current) setActive(first.id);
      },
      { rootMargin: "-10% 0px -55% 0px" },
    );
    for (const el of refs.current.values()) io.observe(el);
    return () => io.disconnect();
  }, []);

  const go = (id: SectionId) => {
    setActive(id);
    lockUntil.current = Date.now() + 900;
    refs.current.get(id)?.scrollIntoView({ behavior: document.documentElement.dataset.motion === "reduced" ? "auto" : "smooth", block: "start" });
  };
  const reg = (id: SectionId) => (el: HTMLElement | null) => {
    if (el) refs.current.set(id, el);
  };

  return (
    <>
      <header className="mb-7">
        <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">Changes save as you make them.</p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <nav aria-label="Settings sections" className="flex flex-col gap-1 lg:sticky lg:top-2 lg:self-start">
          {SECTIONS.map((x) => {
            const on = x.id === active;
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => go(x.id)}
                aria-current={on || undefined}
                className={cx(
                  "relative flex items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-colors",
                  on ? "border-violet/60 bg-violet/10" : "border-transparent hover:border-line hover:bg-surface-1",
                )}
              >
                {on && <span aria-hidden className="absolute inset-y-2 -left-px w-[3px] rounded-r-sm bg-violet" />}
                <span className={cx("grid size-8 shrink-0 place-items-center rounded-lg transition-colors", on ? "bg-violet text-on-accent" : "bg-surface-3 text-ink-muted")}>
                  <x.Icon aria-hidden className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{x.name}</span>
                  <span className="block truncate text-xs text-ink-muted">{x.value(s)}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-col gap-5">
          <Hotkeys s={s} reg={reg("hotkeys")} />
          <Behaviour s={s} reg={reg("behaviour")} />
          <section ref={reg("timing")} id="set-timing" className="scroll-mt-4">
            <Panel
              icon={<Timer aria-hidden className="size-5" />}
              title="Timing"
              blurb="How MacroForge waits between presses. Both are far under one game frame; Precise trades a little CPU for exactness."
              aside={
                <Button size="sm" variant="ghost" onClick={() => navigate({ view: "performance" })}>
                  Test on this PC
                </Button>
              }
            >
              <TimingModes timing={s.timing} />
            </Panel>
          </section>
          <Notice s={s} reg={reg("notice")} />
          <Sounds s={s} reg={reg("sounds")} />
          <Appearance s={s} reg={reg("appearance")} />
          <Data reg={reg("data")} />
          <About reg={reg("about")} />
        </div>
      </div>
    </>
  );
}

type Reg = (el: HTMLElement | null) => void;

function Wrap({ id, reg, children }: { id: SectionId; reg: Reg; children: ReactNode }) {
  return (
    <section ref={reg} id={`set-${id}`} className="scroll-mt-4">
      {children}
    </section>
  );
}

function Hotkeys({ s, reg }: { s: Settings; reg: Reg }) {
  return (
    <Wrap id="hotkeys" reg={reg}>
      <Panel glow icon={<Keyboard aria-hidden className="size-5" />} title="Hotkeys" blurb="Two keys that work in any app, even while your bindings are off.">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <HotkeyCard
            Icon={Power}
            tone="lime"
            title="Bindings on / off"
            what="Switches every binding on or off at once. Scroll Lock by default: on many keyboards its light shows the state."
            value={s.masterHotkey}
            label="Master hotkey"
            onChange={(hk) => setHotkey("masterHotkey", hk)}
          />
          <HotkeyCard
            Icon={Octagon}
            tone="bad"
            title="Stop everything"
            what="Stops every running macro, rapid fire and held key, and lets go of anything MacroForge is holding down."
            value={s.panicHotkey}
            label="Stop-all hotkey"
            onChange={(hk) => setHotkey("panicHotkey", hk)}
          />
        </div>
      </Panel>
    </Wrap>
  );
}

function HotkeyCard({
  Icon,
  tone,
  title,
  what,
  value,
  label,
  onChange,
}: {
  Icon: typeof Power;
  tone: "lime" | "bad";
  title: string;
  what: string;
  value: { input: number; mods: number };
  label: string;
  onChange: (v: { input: number; mods: number }) => void;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-line bg-surface-0/40 p-4">
      <div className="flex items-center gap-3">
        <span className={cx("grid size-8 place-items-center rounded-lg", tone === "lime" ? "bg-lime/15 text-lime" : "bg-bad/15 text-bad")}>
          <Icon aria-hidden className="size-4" />
        </span>
        <p className="flex-1 text-sm font-extrabold tracking-tight">{title}</p>
      </div>
      <p className="mt-2.5 flex-1 text-xs leading-relaxed text-ink-muted">{what}</p>
      <div className="mt-4">
        <KeyField label={label} value={value} onChange={onChange} quick={[]} />
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10.5px] font-bold tracking-[0.14em] text-ink-faint uppercase">{title}</p>
      <div className="divide-y divide-line rounded-xl border border-line bg-surface-0/40 px-4">{children}</div>
    </div>
  );
}

function Behaviour({ s, reg }: { s: Settings; reg: Reg }) {
  return (
    <Wrap id="behaviour" reg={reg}>
      <Panel icon={<SlidersHorizontal aria-hidden className="size-5" />} title="Behaviour" blurb="When MacroForge starts, and what it listens to.">
        <div className="flex flex-col gap-5">
          <Group title="Starting up">
            <SwitchRow
              title="Start with Windows"
              hint="Opens in the tray when you sign in (your user’s Run key only)."
              checked={s.startWithWindows}
              onChange={(startWithWindows) => setSettings({ startWithWindows })}
            />
            <SwitchRow
              title="Start minimized to the tray"
              hint="No window on launch; open it from the tray icon."
              checked={s.startMinimized}
              onChange={(startMinimized) => setSettings({ startMinimized })}
            />
            <SwitchRow
              title="Bindings on when MacroForge opens"
              hint="Off means you press the on / off hotkey first."
              checked={s.armedOnLaunch}
              onChange={(armedOnLaunch) => setSettings({ armedOnLaunch })}
            />
          </Group>
          <Group title="While it runs">
            <SwitchRow
              title="Closing the window keeps MacroForge in the tray"
              hint="Your bindings keep working with the window closed. Quit from the tray icon."
              checked={s.closeToTray}
              onChange={(closeToTray) => setSettings({ closeToTray })}
            />
            <SwitchRow
              title="Ignore input from other programs"
              hint="On-screen keyboards and other macro tools won’t set off your bindings."
              checked={s.ignoreForeignInjected}
              onChange={(ignoreForeignInjected) => setSettings({ ignoreForeignInjected })}
            />
          </Group>
        </div>
      </Panel>
    </Wrap>
  );
}

function Notice({ s, reg }: { s: Settings; reg: Reg }) {
  return (
    <Wrap id="notice" reg={reg}>
      <Panel
        icon={<MonitorSmartphone aria-hidden className="size-5" />}
        title="On-screen notice"
        blurb="A small line over your game when something switches. It never takes focus and clicks pass straight through it."
        aside={
          <Button size="sm" icon={<Play aria-hidden className="size-3.5" />} disabled={!s.hud} onClick={() => void backend().previewHud()}>
            Show it now
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_15rem]">
          <div>
            <p className="mb-2 text-xs font-bold text-ink">Where it shows</p>
            {/* A little screen: click a spot to put the notice there. */}
            <div
              role="radiogroup"
              aria-label="Notice position"
              className={cx(
                "relative aspect-[16/8] w-full overflow-hidden rounded-xl border border-line-strong bg-surface-0 texture-grid transition-opacity",
                !s.hud && "opacity-40",
              )}
            >
              <span aria-hidden className="absolute inset-x-[30%] bottom-0 h-[3px] rounded-t bg-line-strong" />
              <span aria-hidden className="absolute top-1/2 left-1/2 size-3 -translate-1/2 rounded-full border border-ink-faint/50" />
              {HUD_SPOTS.map((h) => {
                const on = h.id === s.hudPosition;
                return (
                  <button
                    key={h.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={h.name}
                    disabled={!s.hud}
                    onClick={() => setSettings({ hudPosition: h.id })}
                    className={cx(
                      "absolute inline-flex items-center gap-1.5 border text-[11px] font-bold whitespace-nowrap transition-all",
                      on && s.hudStealth ? "rounded-full p-1" : "rounded-lg px-2.5 py-1.5",
                      h.x,
                      h.y,
                      on
                        ? "border-lime/50 bg-black/85 text-ink shadow-[0_0_24px_-6px_var(--color-lime)]"
                        : "border-dashed border-line-strong text-transparent hover:border-ink-faint hover:text-ink-faint",
                    )}
                  >
                    {on && s.hudStealth ? (
                      <span className="grid size-5 place-items-center rounded-full border-2 border-lime text-lime">
                        <Check aria-hidden className="size-3" strokeWidth={4} />
                      </span>
                    ) : (
                      <>
                        <span className={cx("size-1.5 rounded-full", on ? "bg-lime" : "bg-current")} />
                        {on ? "Auto-clicker on" : h.name}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="divide-y divide-line rounded-xl border border-line bg-surface-0/40 px-4">
              <SwitchRow title="Show the notice" checked={s.hud} onChange={(hud) => setSettings({ hud })} />
              <SwitchRow
                title="Stealth"
                hint="Just a small circle: a green ✓ for on, a red ✕ for off."
                checked={s.hudStealth}
                disabled={!s.hud}
                onChange={(hudStealth) => setSettings({ hudStealth })}
              />
            </div>
            <p className="text-xs leading-relaxed text-ink-muted">
              Shows for a moment when you switch bindings, a profile or a single binding on or off. For it to appear over a game, run the game in borderless or windowed fullscreen.
            </p>
          </div>
        </div>
      </Panel>
    </Wrap>
  );
}

function Sounds({ s, reg }: { s: Settings; reg: Reg }) {
  return (
    <Wrap id="sounds" reg={reg}>
      <Panel
        icon={<Volume2 aria-hidden className="size-5" />}
        title="Sounds"
        blurb="A quiet cue when something switches: one you feel more than hear."
        aside={
          <label className="flex items-center gap-2 text-sm font-bold">
            <span className="text-ink-muted">{s.sounds ? "On" : "Off"}</span>
            <Switch checked={s.sounds} onChange={(sounds) => setSettings({ sounds })} label="Play sounds" />
          </label>
        }
      >
        <div className={cx("flex flex-col gap-5 transition-opacity", !s.sounds && "pointer-events-none opacity-40")} aria-disabled={!s.sounds}>
          <div role="radiogroup" aria-label="Sound" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {SOUNDS.map((x) => {
              const on = x.id === s.soundStyle;
              return (
                <button
                  key={x.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setSettings({ soundStyle: x.id });
                    void testSound(true);
                  }}
                  className={cx(
                    "flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors",
                    on ? "border-violet/60 bg-violet/[0.07]" : "border-line hover:border-line-strong",
                  )}
                >
                  <SoundGlyph style={x.id} on={on} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">{x.name}</span>
                    <span className="block text-xs text-ink-muted">{x.what}</span>
                  </span>
                  {on && <Check aria-hidden className="size-4 text-violet" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface-0/40 px-4 py-3.5">
            <span className="w-24 text-xs font-bold text-ink">Volume</span>
            <Volume1 aria-hidden className="size-4 shrink-0 text-ink-faint" />
            <div className="min-w-40 flex-1">
              <Slider label="Volume" min={5} max={100} step={5} value={s.soundVolume} onChange={(soundVolume) => setSettings({ soundVolume })} />
            </div>
            <Volume2 aria-hidden className="size-4 shrink-0 text-ink-faint" />
            <span className="w-12 text-right font-mono text-sm font-bold tabular-nums">{s.soundVolume}%</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<Play aria-hidden className="size-3.5" />} onClick={() => void testSound(true)}>
              Hear “on”
            </Button>
            <Button size="sm" variant="ghost" icon={<Play aria-hidden className="size-3.5" />} onClick={() => void testSound(false)}>
              Hear “off”
            </Button>
          </div>
        </div>
      </Panel>
    </Wrap>
  );
}

/** A tiny waveform per sound style, so the three read differently at a glance. */
function SoundGlyph({ style, on }: { style: SoundStyle; on: boolean }) {
  const bars = style === "click" ? [3, 14, 6, 2, 1] : style === "chime" ? [5, 10, 7, 12, 8, 5, 3] : [4, 9, 14, 9, 4];
  return (
    <span className={cx("flex h-9 w-12 shrink-0 items-center justify-center gap-[3px] rounded-lg", on ? "bg-violet text-on-accent" : "bg-surface-3 text-ink-muted")} aria-hidden>
      {bars.map((b, i) => (
        <span key={i} className="w-[3px] rounded-full bg-current" style={{ height: `${b + 4}px` }} />
      ))}
    </span>
  );
}

function Appearance({ s, reg }: { s: Settings; reg: Reg }) {
  const accent = ACCENTS.find((a) => a.id === s.accent) ?? ACCENTS[0]!;
  return (
    <Wrap id="appearance" reg={reg}>
      <Panel icon={<Palette aria-hidden className="size-5" />} title="Appearance" blurb="The accent colour and how much moves.">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_17rem]">
          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-2.5 text-xs font-bold text-ink">Accent colour</p>
              <div role="radiogroup" aria-label="Accent colour" className="grid max-w-lg grid-cols-4 gap-1 sm:grid-cols-7">
                {ACCENTS.map((a) => {
                  const on = s.accent === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setSettings({ accent: a.id })}
                      className={cx(
                        "flex flex-col items-center gap-1.5 rounded-xl border px-1 pt-2.5 pb-2 transition-colors",
                        on ? "border-line-strong bg-surface-2" : "border-transparent hover:bg-surface-2/60",
                      )}
                    >
                      <span
                        className={cx("grid size-9 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-surface-1", on ? "ring-white" : "ring-transparent")}
                        style={{ background: a.color }}
                      >
                        {on && <Check aria-hidden className="size-4 text-white" strokeWidth={3} />}
                      </span>
                      <span className={cx("text-[11px] font-bold", on ? "text-ink" : "text-ink-muted")}>{a.name}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2.5 text-xs text-ink-muted">
                Signal is MacroForge’s own; the others are the family colours shared with PeakTweaks and Crosshair Forge. Lime always means on.
              </p>
            </div>
            <div>
              <p className="mb-2.5 text-xs font-bold text-ink">Animations</p>
              <Segmented
                label="Animations"
                value={s.motion ?? "full"}
                onChange={(motion) => setSettings({ motion })}
                options={[
                  { value: "full", label: "On" },
                  { value: "system", label: "Follow Windows" },
                  { value: "off", label: "Off" },
                ]}
              />
              <p className="mt-2.5 text-xs text-ink-muted">
                {windowsReducesMotion
                  ? "Windows’ animation effects are off on this PC, so “Follow Windows” switches MacroForge’s off too."
                  : "The on / off moment, the signal trace and the live pulses. They pause whenever MacroForge is in the background."}
              </p>
            </div>
          </div>

          {/* A live sample of the accent in use. */}
          <div aria-hidden className="relative overflow-hidden rounded-xl border border-line bg-surface-0 p-4 texture-grid">
            <span className="pointer-events-none absolute -top-12 -right-10 size-40 rounded-full opacity-25 blur-3xl" style={{ background: accent.color }} />
            <p className="relative text-[10.5px] font-bold tracking-[0.14em] text-ink-faint uppercase">Preview</p>
            <div className="relative mt-3 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-violet text-on-accent">
                <Keyboard className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-extrabold">Auto-clicker</span>
                <span className="block text-xs text-ink-muted">Mouse 5 · 15 per second</span>
              </span>
            </div>
            <div className="relative mt-4 flex items-center gap-2">
              <span className="inline-flex h-8 items-center rounded-lg bg-violet px-3 text-xs font-bold text-on-accent">Add</span>
              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-lime px-3 text-xs font-bold text-black">
                <Power className="size-3.5" /> On
              </span>
            </div>
            <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <span className="absolute inset-y-0 left-0 w-2/3 rounded-full bg-violet" />
            </div>
          </div>
        </div>
      </Panel>
    </Wrap>
  );
}

function Data({ reg }: { reg: Reg }) {
  const dir = useStore((st) => st.dataDir);
  return (
    <Wrap id="data" reg={reg}>
      <Panel
        icon={<FolderOpen aria-hidden className="size-5" />}
        title="Your data"
        blurb="Saved as you go, with a backup of the previous save. Share single profiles from Bindings."
        aside={
          <Button size="sm" icon={<FolderOpen aria-hidden className="size-3.5" />} onClick={() => void backend().openDataDir()}>
            Open folder
          </Button>
        }
      >
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-0/40 px-4 py-3">
          <span className="text-[10.5px] font-bold tracking-[0.14em] text-ink-faint uppercase">Folder</span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink" title={dir}>
            {dir}
          </span>
        </div>
      </Panel>
    </Wrap>
  );
}

function About({ reg }: { reg: Reg }) {
  const version = useStore((st) => st.version);
  const elevated = useStore((st) => st.status?.selfElevated ?? false);
  const facts = [
    ["Reads input", "Windows’ standard keyboard and mouse hooks"],
    ["Sends input", "SendInput, the same documented way on-screen keyboards do"],
    ["Installs", "No driver. Nothing injected into any game"],
    ["Network", "None. Nothing leaves this PC"],
  ];
  return (
    <Wrap id="about" reg={reg}>
      <Panel
        icon={<ShieldCheck aria-hidden className="size-5" />}
        title="How MacroForge works"
        blurb={
          <>
            Version <span className="font-mono text-ink">{version}</span>
            {elevated ? " · running as administrator" : ""}
          </>
        }
      >
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {facts.map(([k, v]) => (
            <div key={k} className="flex gap-3 rounded-xl border border-line bg-surface-0/40 px-4 py-3">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-lime" strokeWidth={3} />
              <div className="min-w-0">
                <dt className="text-xs font-bold text-ink">{k}</dt>
                <dd className="mt-0.5 text-xs text-ink-muted">{v}</dd>
              </div>
            </div>
          ))}
        </dl>
      </Panel>
    </Wrap>
  );
}
