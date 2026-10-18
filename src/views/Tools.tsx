// Quick tools: the common setups, one focused builder at a time.
// Left: every tool, grouped, with how many of each you already have.
// Right: the selected tool's builder (numbered steps, a summary of what it
// will do, Add), then "Your setups" of that kind to switch or open.
// Every tool just creates an ordinary binding, editable later in Bindings.

import { useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Ban, ChevronsDown, Lock, MousePointerClick, Repeat2, RotateCw, Shuffle, Type } from "lucide-react";

import { AddSpec, Builder, NO_KEY, OnOffKeyStep, Step } from "../components/Builder";
import { ConditionsQuick } from "../components/Conditions";
import { FireRateHelper } from "../components/FireRate";
import { KeyField, type KeyValue } from "../components/KeyField";
import { useNavigate } from "../components/Shell";
import { cx, Keycap, NumberField, PageHeader, Segmented, Select, Slider, Switch, TextInput } from "../components/ui";
import { bindingTitle, fmtRate, newId } from "../lib/describe";
import { comboName, isMouseButton, isWheel, keyName, MOUSE_LEFT, MOUSE_MIDDLE, MOUSE_RIGHT, WHEEL_DOWN, WHEEL_UP } from "../lib/keys";
import { NO_CONDITIONS, type Binding, type Conditions, type Data, type Macro, type TriggerMode } from "../lib/types";
import { mutateProfile, toast, update, useStore } from "../store";
import { TurnTool } from "./TurnTool";

type ToolId = "autoclicker" | "turbo" | "turn" | "autorun" | "scroll" | "remap" | "snippet" | "disable";

interface ToolMeta {
  id: ToolId;
  name: string;
  blurb: string;
  group: "Clicking & firing" | "Camera & movement" | "Keys & text";
  Icon: typeof Repeat2;
  /** Is an existing binding one of these? (for counts and "Your setups") */
  is: (b: Binding, data: Data) => boolean;
}

const macroOf = (b: Binding, data: Data) => (b.action.type === "macro" ? data.macros.find((m) => m.id === (b.action as { macroId: string }).macroId) : undefined);

const TOOLS: ToolMeta[] = [
  {
    id: "autoclicker",
    name: "Auto-clicker",
    blurb: "Clicks for you at a steady rate, started and stopped with a key.",
    group: "Clicking & firing",
    Icon: MousePointerClick,
    is: (b) => b.action.type === "rapid" && isMouseButton(b.action.output) && b.action.output !== b.trigger.input,
  },
  {
    id: "turbo",
    name: "Turbo key",
    blurb: "Hold a key or button and it repeats by itself, like a controller’s turbo.",
    group: "Clicking & firing",
    Icon: Repeat2,
    is: (b) => b.action.type === "rapid" && b.action.output === b.trigger.input,
  },
  {
    id: "turn",
    name: "Perfect 180",
    blurb: "One button turns you around exactly 180°, worked out from your game and sensitivity.",
    group: "Camera & movement",
    Icon: RotateCw,
    is: (b, d) => {
      const m = macroOf(b, d);
      return !!m && m.steps.length === 1 && m.steps[0]!.type === "move";
    },
  },
  {
    id: "autorun",
    name: "Auto-run / hold lock",
    blurb: "Press once to keep a key held down (auto-run, auto-sprint); press again to let go.",
    group: "Camera & movement",
    Icon: Lock,
    is: (b) => b.action.type === "holdLock",
  },
  {
    id: "scroll",
    name: "Scroll spam",
    blurb: "Hold a key to send a stream of scroll-wheel notches.",
    group: "Camera & movement",
    Icon: ChevronsDown,
    is: (b) => b.action.type === "rapid" && isWheel(b.action.output),
  },
  {
    id: "remap",
    name: "Remap a key",
    blurb: "Make one key or mouse button act as another, or as a shortcut like Ctrl + C.",
    group: "Keys & text",
    Icon: Shuffle,
    is: (b) => b.action.type === "remap",
  },
  {
    id: "snippet",
    name: "Text snippet",
    blurb: "Type a message with one key, optionally opening game chat first.",
    group: "Keys & text",
    Icon: Type,
    is: (b, d) => !!macroOf(b, d)?.steps.some((s) => s.type === "text"),
  },
  {
    id: "disable",
    name: "Disable a key",
    blurb: "Stop a key from doing anything, like the Windows key that drops you to the desktop.",
    group: "Keys & text",
    Icon: Ban,
    is: (b) => b.action.type === "block",
  },
];

const GROUPS = ["Clicking & firing", "Camera & movement", "Keys & text"] as const;

export function ToolsView() {
  const data = useStore((s) => s.data)!;
  const navigate = useNavigate();
  const [pid, setPid] = useState(data.profiles[0]!.id);
  const [tool, setTool] = useState<ToolId>("autoclicker");
  const profile = data.profiles.find((p) => p.id === pid) ?? data.profiles[0]!;
  const meta = TOOLS.find((t) => t.id === tool)!;

  const all = useMemo(() => data.profiles.flatMap((p) => p.bindings.map((b) => ({ p, b }))), [data.profiles]);
  const count = (t: ToolMeta) => all.filter(({ b }) => t.is(b, data)).length;

  const add = (spec: AddSpec) => {
    const b: Binding = {
      id: newId("b"),
      name: spec.name,
      enabled: true,
      trigger: { mods: 0, mode: "press", passthrough: false, ...spec.trigger },
      action: spec.action,
      conditions: spec.conditions ?? NO_CONDITIONS,
      toggleKey: spec.toggleKey ?? NO_KEY,
    };
    update((d) => ({
      ...d,
      macros: spec.macro ? [...d.macros, spec.macro] : d.macros,
      profiles: d.profiles.map((p) => (p.id === profile.id ? { ...p, bindings: [...p.bindings, b] } : p)),
    }));
    toast(`${spec.name} added to ${profile.name}`);
  };

  const frame = { profileName: profile.name, onOpenBindings: () => navigate({ view: "bindings", focus: profile.id }) };
  const builders: Record<ToolId, ReactNode> = {
    autoclicker: <AutoClicker onAdd={add} {...frame} />,
    turbo: <Turbo onAdd={add} {...frame} />,
    turn: <TurnTool onAdd={add} {...frame} />,
    autorun: <AutoRun onAdd={add} {...frame} />,
    scroll: <ScrollSpam onAdd={add} {...frame} />,
    remap: <Remap onAdd={add} {...frame} />,
    snippet: <TextSnippet onAdd={add} {...frame} />,
    disable: <DisableKey onAdd={add} {...frame} />,
  };
  const mine = all.filter(({ b }) => meta.is(b, data));

  return (
    <>
      <PageHeader
        title="Quick tools"
        description="Pick a tool, set it up in a few steps, and it’s on a key. Everything you make here is a normal binding you can fine-tune later."
        actions={
          <label className="flex items-center gap-2 text-xs font-bold text-ink-muted">
            Add to
            <Select label="Add to profile" value={profile.id} onChange={setPid} options={data.profiles.map((p) => ({ value: p.id, label: p.name }))} className="min-w-44" />
          </label>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        {/* ---------------------------------------------- launcher */}
        <nav aria-label="Tools" className="flex flex-col gap-5 lg:sticky lg:top-2 lg:self-start">
          {GROUPS.map((g) => (
            <div key={g}>
              <p className="mb-2 px-1 text-[10.5px] font-bold tracking-[0.14em] text-ink-faint uppercase">{g}</p>
              <ul className="flex flex-col gap-1.5">
                {TOOLS.filter((t) => t.group === g).map((t) => {
                  const on = t.id === tool;
                  const n = count(t);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setTool(t.id)}
                        aria-current={on || undefined}
                        className={cx(
                          "group relative flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                          on ? "border-violet/60 bg-violet/10" : "border-transparent hover:border-line hover:bg-surface-1",
                        )}
                      >
                        {on && <span aria-hidden className="absolute inset-y-2 -left-px w-[3px] rounded-r-sm bg-violet" />}
                        <span className={cx("grid size-9 shrink-0 place-items-center rounded-lg transition-colors", on ? "bg-violet text-on-accent" : "bg-surface-3 text-ink-muted group-hover:text-ink")}>
                          <t.Icon aria-hidden className="size-[18px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{t.name}</span>
                        </span>
                        {n > 0 && (
                          <span className="grid h-5 min-w-5 place-items-center rounded-md bg-lime/15 px-1.5 text-[11px] font-bold text-lime" title={`${n} set up`}>
                            {n}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* ---------------------------------------------- builder */}
        <div className="flex min-w-0 flex-col gap-6">
          <div key={tool}>{builders[tool]}</div>

          {mine.length > 0 && (
            <section>
              <p className="mb-2 px-1 text-[10.5px] font-bold tracking-[0.14em] text-ink-faint uppercase">
                Your {meta.name.toLowerCase()} setups
              </p>
              <ul className="flex flex-col gap-1.5">
                {mine.map(({ p, b }) => (
                  <li key={b.id} className={cx("flex items-center gap-3 rounded-xl border border-line bg-surface-1 px-3 py-2", !b.enabled && "opacity-60")}>
                    <Keycap input={b.trigger.input} mods={b.trigger.mods} />
                    <ArrowRight aria-hidden className="size-3.5 shrink-0 text-ink-faint" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{bindingTitle(b, data.macros)}</span>
                    {b.toggleKey?.input ? <span className="text-[11px] font-bold text-ink-muted">{comboName(b.toggleKey.input, b.toggleKey.mods)} on / off</span> : null}
                    <span className="text-[11px] text-ink-faint">{p.name}</span>
                    <button type="button" className="text-xs font-bold text-ink-muted hover:text-ink" onClick={() => navigate({ view: "bindings", focus: p.id })}>
                      Edit
                    </button>
                    <Switch
                      label={`${b.name || "Binding"} on`}
                      checked={b.enabled}
                      onChange={(enabled) => mutateProfile(p.id, (x) => ({ ...x, bindings: x.bindings.map((y) => (y.id === b.id ? { ...y, enabled } : y)) }))}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ tools --

interface ToolProps {
  onAdd: (spec: AddSpec) => void;
  profileName: string;
  onOpenBindings: () => void;
}

function Rate({ value, onChange, max = 50, unit = "/ s" }: { value: number; onChange: (v: number) => void; max?: number; unit?: string }) {
  return (
    <div className="flex items-center gap-4">
      <Slider label="Per second" min={1} max={max} step={0.5} value={value} onChange={onChange} />
      <NumberField label="Per second" min={0.1} max={1000} value={value} onChange={onChange} suffix={unit} width="w-20" />
    </div>
  );
}

function ModePick({ value, onChange }: { value: TriggerMode; onChange: (m: TriggerMode) => void }) {
  return (
    <Segmented
      label="Mode"
      value={value}
      onChange={onChange}
      options={[
        { value: "toggle", label: "Press to start / stop" },
        { value: "hold", label: "Only while held" },
      ]}
    />
  );
}

function AutoClicker({ onAdd, ...frame }: ToolProps) {
  const [button, setButton] = useState(MOUSE_LEFT);
  const [rate, setRate] = useState(15);
  const [key, setKey] = useState<KeyValue>({ input: 0x76, mods: 0 });
  const [mode, setMode] = useState<TriggerMode>("toggle");
  const [cond, setCond] = useState<Conditions>(NO_CONDITIONS);
  const [onOff, setOnOff] = useState<KeyValue>(NO_KEY);
  return (
    <Builder
      {...frame}
      icon={<MousePointerClick aria-hidden className="size-6" />}
      title="Auto-clicker"
      blurb={TOOLS[0]!.blurb}
      addLabel="Add auto-clicker"
      canAdd={!!key.input}
      summary={
        <>
          <span className="font-bold text-ink">{comboName(key.input, key.mods)}</span> {mode === "toggle" ? "starts and stops" : "while held:"} {keyName(button).toLowerCase()} at{" "}
          <span className="font-bold text-ink">{fmtRate(rate)}/s</span>
        </>
      }
      onAdd={() => onAdd({ name: "Auto-clicker", trigger: { input: key.input, mods: key.mods, mode }, action: { type: "rapid", output: button, rate, holdMs: 0, jitterPct: 0 }, conditions: cond, toggleKey: onOff })}
    >
      <Step n={1} title="What to click">
        <Segmented
          label="Button"
          value={String(button)}
          onChange={(v) => setButton(Number(v))}
          options={[
            { value: String(MOUSE_LEFT), label: "Left click" },
            { value: String(MOUSE_RIGHT), label: "Right click" },
            { value: String(MOUSE_MIDDLE), label: "Middle click" },
          ]}
        />
      </Step>
      <Step n={2} title="How fast" hint="Clicks per second.">
        <div className="flex flex-col gap-3">
          <Rate value={rate} onChange={setRate} />
          <FireRateHelper rate={rate} onRate={setRate} />
        </div>
      </Step>
      <Step n={3} title="Start it with">
        <div className="flex flex-col gap-3">
          <KeyField label="Auto-clicker key" value={key} onChange={setKey} quick={[]} />
          <ModePick value={mode} onChange={setMode} />
        </div>
      </Step>
      <Step n={4} title="Only when…" optional>
        <ConditionsQuick value={cond} onChange={setCond} trigger={key.input} toggle={mode === "toggle"} />
      </Step>
      {mode === "hold" && <OnOffKeyStep n={5} value={onOff} onChange={setOnOff} trigger={key.input} />}
    </Builder>
  );
}

function Turbo({ onAdd, ...frame }: ToolProps) {
  const [key, setKey] = useState<KeyValue>({ input: 0, mods: 0 });
  const [rate, setRate] = useState(12);
  const [cond, setCond] = useState<Conditions>(NO_CONDITIONS);
  const [onOff, setOnOff] = useState<KeyValue>(NO_KEY);
  return (
    <Builder
      {...frame}
      icon={<Repeat2 aria-hidden className="size-6" />}
      title="Turbo key"
      blurb={TOOLS[1]!.blurb}
      addLabel="Add turbo"
      canAdd={!!key.input}
      summary={
        key.input ? (
          <>
            Hold <span className="font-bold text-ink">{keyName(key.input)}</span> and it repeats <span className="font-bold text-ink">{fmtRate(rate)}×/s</span>
          </>
        ) : (
          "Choose the key or button to turbo."
        )
      }
      onAdd={() =>
        onAdd({ name: `Turbo ${keyName(key.input)}`, trigger: { input: key.input, mode: "hold" }, action: { type: "rapid", output: key.input, rate, holdMs: 0, jitterPct: 0 }, conditions: cond, toggleKey: onOff })
      }
    >
      <Step n={1} title="Key or button to turbo" hint="Holding it sends it again and again. Left click is the classic rapid fire.">
        <KeyField label="Turbo key" withMods={false} value={key} onChange={setKey} />
      </Step>
      <Step n={2} title="How fast" hint="Presses per second while held.">
        <div className="flex flex-col gap-3">
          <Rate value={rate} onChange={setRate} />
          <FireRateHelper rate={rate} onRate={setRate} />
        </div>
      </Step>
      <Step n={3} title="Only when…" optional>
        <ConditionsQuick value={cond} onChange={(c) => setCond({ ...c, whileHeld: c.whileHeld === key.input ? 0 : c.whileHeld })} trigger={key.input} toggle={false} />
      </Step>
      <OnOffKeyStep n={4} value={onOff} onChange={setOnOff} trigger={key.input} />
    </Builder>
  );
}

function AutoRun({ onAdd, ...frame }: ToolProps) {
  const [key, setKey] = useState<KeyValue>({ input: 0, mods: 0 });
  const [held, setHeld] = useState<KeyValue>({ input: 0x57, mods: 0 });
  return (
    <Builder
      {...frame}
      icon={<Lock aria-hidden className="size-6" />}
      title="Auto-run / hold lock"
      blurb={TOOLS[3]!.blurb}
      addLabel="Add hold lock"
      canAdd={!!key.input && !!held.input}
      summary={
        key.input ? (
          <>
            <span className="font-bold text-ink">{comboName(key.input, key.mods)}</span> holds <span className="font-bold text-ink">{keyName(held.input)}</span> down until pressed again
          </>
        ) : (
          "Choose the key that locks it."
        )
      }
      onAdd={() => onAdd({ name: `Hold ${keyName(held.input)}`, trigger: { input: key.input, mods: key.mods }, action: { type: "holdLock", output: held.input } })}
    >
      <Step n={1} title="Key to hold down" hint="W for auto-run, Shift for auto-sprint, right click for hold-to-aim.">
        <KeyField label="Held key" withMods={false} value={held} onChange={setHeld} />
      </Step>
      <Step n={2} title="Press to lock / unlock" hint="It also lets go when you switch away from the game or press Stop all.">
        <KeyField label="Hold lock trigger" value={key} onChange={setKey} />
      </Step>
    </Builder>
  );
}

function ScrollSpam({ onAdd, ...frame }: ToolProps) {
  const [key, setKey] = useState<KeyValue>({ input: 0x20, mods: 0 });
  const [dir, setDir] = useState(WHEEL_DOWN);
  const [rate, setRate] = useState(30);
  const [onOff, setOnOff] = useState<KeyValue>(NO_KEY);
  return (
    <Builder
      {...frame}
      icon={<ChevronsDown aria-hidden className="size-6" />}
      title="Scroll spam"
      blurb={TOOLS[4]!.blurb}
      addLabel="Add scroll spam"
      canAdd={!!key.input}
      summary={
        <>
          Hold <span className="font-bold text-ink">{comboName(key.input, key.mods)}</span>: scroll {dir === WHEEL_DOWN ? "down" : "up"} <span className="font-bold text-ink">{fmtRate(rate)}×/s</span>
        </>
      }
      onAdd={() => onAdd({ name: "Scroll spam", trigger: { input: key.input, mods: key.mods, mode: "hold" }, action: { type: "rapid", output: dir, rate, holdMs: 0, jitterPct: 0 }, toggleKey: onOff })}
    >
      <Step n={1} title="Direction">
        <Segmented
          label="Direction"
          value={String(dir)}
          onChange={(v) => setDir(Number(v))}
          options={[
            { value: String(WHEEL_DOWN), label: "Scroll down" },
            { value: String(WHEEL_UP), label: "Scroll up" },
          ]}
        />
      </Step>
      <Step n={2} title="How fast" hint="Notches per second.">
        <Rate value={rate} onChange={setRate} max={100} />
      </Step>
      <Step n={3} title="While I hold">
        <KeyField label="Scroll spam key" value={key} onChange={setKey} quick={[]} />
      </Step>
      <OnOffKeyStep n={4} value={onOff} onChange={setOnOff} trigger={key.input} />
    </Builder>
  );
}

function Remap({ onAdd, ...frame }: ToolProps) {
  const [from, setFrom] = useState<KeyValue>({ input: 0, mods: 0 });
  const [to, setTo] = useState<KeyValue>({ input: 0, mods: 0 });
  return (
    <Builder
      {...frame}
      icon={<Shuffle aria-hidden className="size-6" />}
      title="Remap a key"
      blurb={TOOLS[5]!.blurb}
      addLabel="Add remap"
      canAdd={!!from.input && !!to.input}
      summary={
        from.input && to.input ? (
          <>
            <span className="font-bold text-ink">{comboName(from.input, from.mods)}</span> becomes <span className="font-bold text-ink">{comboName(to.input, to.mods)}</span>
          </>
        ) : (
          "Choose a key and what it should become."
        )
      }
      onAdd={() => onAdd({ name: `${comboName(from.input, from.mods)} → ${comboName(to.input, to.mods)}`, trigger: { input: from.input, mods: from.mods }, action: { type: "remap", output: to.input, mods: to.mods } })}
    >
      <Step n={1} title="When I press">
        <KeyField label="Remap from" value={from} onChange={setFrom} />
      </Step>
      <Step n={2} title="Send this instead" hint="Add Ctrl / Shift / Alt for a shortcut, like Ctrl + C.">
        <KeyField label="Remap to" value={to} onChange={setTo} />
      </Step>
    </Builder>
  );
}

function TextSnippet({ onAdd, ...frame }: ToolProps) {
  const [key, setKey] = useState<KeyValue>({ input: 0, mods: 0 });
  const [text, setText] = useState("");
  const [chat, setChat] = useState(true);
  return (
    <Builder
      {...frame}
      icon={<Type aria-hidden className="size-6" />}
      title="Text snippet"
      blurb={TOOLS[6]!.blurb}
      addLabel="Add snippet"
      canAdd={!!key.input && !!text.trim()}
      summary={
        key.input && text ? (
          <>
            <span className="font-bold text-ink">{comboName(key.input, key.mods)}</span> types “{text.length > 30 ? text.slice(0, 30) + "…" : text}”{chat ? " in chat" : ""}
          </>
        ) : (
          "Write the text and choose its key."
        )
      }
      onAdd={() => {
        const steps: Macro["steps"] = chat
          ? [
              { type: "press", input: 0x0d, holdMs: 15 },
              { type: "delay", ms: 60, jitterMs: 0 },
              { type: "text", text, charDelayMs: 5 },
              { type: "delay", ms: 30, jitterMs: 0 },
              { type: "press", input: 0x0d, holdMs: 15 },
            ]
          : [{ type: "text", text, charDelayMs: 5 }];
        const m: Macro = { id: newId("m"), name: `Type “${text.slice(0, 24)}”`, steps };
        onAdd({ name: m.name, trigger: { input: key.input, mods: key.mods }, action: { type: "macro", macroId: m.id, repeat: 1, onRepress: "ignore", stopImmediately: true }, macro: m });
        setText("");
      }}
    >
      <Step n={1} title="Text">
        <TextInput label="Snippet text" value={text} onChange={setText} placeholder="gg wp" className="w-full max-w-lg" />
      </Step>
      <Step n={2} title="Game chat">
        <label className="flex items-center gap-3 text-sm">
          <Switch label="Press Enter before and after" checked={chat} onChange={setChat} />
          Press Enter before and after, to open chat and send it
        </label>
      </Step>
      <Step n={3} title="Key">
        <KeyField label="Snippet key" value={key} onChange={setKey} quick={[]} />
      </Step>
    </Builder>
  );
}

function DisableKey({ onAdd, ...frame }: ToolProps) {
  const [key, setKey] = useState<KeyValue>({ input: 0, mods: 0 });
  return (
    <Builder
      {...frame}
      icon={<Ban aria-hidden className="size-6" />}
      title="Disable a key"
      blurb={TOOLS[7]!.blurb}
      addLabel="Disable key"
      canAdd={!!key.input}
      summary={key.input ? <><span className="font-bold text-ink">{comboName(key.input, key.mods)}</span> will do nothing</> : "Choose the key to disable."}
      onAdd={() => onAdd({ name: `Disable ${keyName(key.input)}`, trigger: { input: key.input, mods: key.mods }, action: { type: "block" } })}
      extraAction={
        <button
          type="button"
          className="h-10 rounded-lg border border-line-strong px-4 text-sm font-bold text-ink hover:bg-surface-2"
          onClick={() => {
            onAdd({ name: "Disable Left Win", trigger: { input: 0x5b }, action: { type: "block" } });
            onAdd({ name: "Disable Right Win", trigger: { input: 0x5c }, action: { type: "block" } });
          }}
        >
          Disable both Windows keys
        </button>
      }
    >
      <Step n={1} title="Key to disable" hint="Common: the Windows keys, Caps Lock, or a key you keep hitting by accident.">
        <KeyField label="Key to disable" value={key} onChange={setKey} quick={[]} />
      </Step>
    </Builder>
  );
}
