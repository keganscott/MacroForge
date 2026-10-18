// Quick tools: the common setups in one card each, ready in two clicks.
// Every tool just creates an ordinary binding (and macro, for text), so it
// can be fine-tuned later in Bindings.

import { useState, type ReactNode } from "react";
import { Ban, ChevronsDown, Lock, MousePointerClick, Repeat2, Shuffle, Type } from "lucide-react";

import { KeyField, type KeyValue } from "../components/KeyField";
import { Button, Card, Field, NumberField, Segmented, Select, Slider, TextInput } from "../components/ui";
import { fmtRate, newId } from "../lib/describe";
import { comboName, keyName, MOUSE_LEFT, MOUSE_MIDDLE, MOUSE_RIGHT, WHEEL_DOWN, WHEEL_UP } from "../lib/keys";
import { NO_CONDITIONS, type Action, type Binding, type Conditions, type Macro, type Trigger, type TriggerMode } from "../lib/types";
import { ConditionsQuick } from "../components/Conditions";
import { TurnTool } from "./TurnTool";
import { toast, update, useStore } from "../store";
import { PageHeader } from "../components/ui";

export function ToolsView() {
  const profiles = useStore((s) => s.data!.profiles);
  const [pid, setPid] = useState(profiles[0]!.id);
  const profile = profiles.find((p) => p.id === pid) ?? profiles[0]!;

  const add = (name: string, trigger: Partial<Trigger> & { input: number }, action: Action, macro?: Macro, conditions: Conditions = NO_CONDITIONS) => {
    const b: Binding = {
      id: newId("b"),
      name,
      enabled: true,
      trigger: { mods: 0, mode: "press", passthrough: false, ...trigger },
      action,
      conditions,
    };
    update((d) => ({
      ...d,
      macros: macro ? [...d.macros, macro] : d.macros,
      profiles: d.profiles.map((p) => (p.id === profile.id ? { ...p, bindings: [...p.bindings, b] } : p)),
    }));
    toast(`${name} added to ${profile.name}`);
  };

  return (
    <>
      <PageHeader
        title="Quick tools"
        description="The setups people use most, ready in two clicks. Each one becomes a normal binding you can fine-tune later."
        actions={
          <label className="flex items-center gap-2 text-xs font-bold text-ink-muted">
            Add to
            <Select label="Add to profile" value={profile.id} onChange={setPid} options={profiles.map((p) => ({ value: p.id, label: p.name }))} className="min-w-44" />
          </label>
        }
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AutoClicker onAdd={add} />
        <Turbo onAdd={add} />
        <TurnTool onAdd={add} />
        <Remap onAdd={add} />
        <AutoRun onAdd={add} />
        <ScrollSpam onAdd={add} />
        <TextSnippet onAdd={add} />
        <DisableKey onAdd={add} />
      </div>
    </>
  );
}

type AddFn = (name: string, trigger: Partial<Trigger> & { input: number }, action: Action, macro?: Macro, conditions?: Conditions) => void;

function Tool({ icon, title, hint, children, footer }: { icon: ReactNode; title: string; hint: string; children: ReactNode; footer: ReactNode }) {
  return (
    <Card className="flex flex-col">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet text-on-accent">{icon}</span>
        <div>
          <h2 className="text-base font-extrabold tracking-tight">{title}</h2>
          <p className="text-xs text-ink-muted">{hint}</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4">{children}</div>
      <div className="mt-5 flex items-center justify-end gap-3 border-t border-line pt-4">{footer}</div>
    </Card>
  );
}

function ModePick({ value, onChange }: { value: TriggerMode; onChange: (m: TriggerMode) => void }) {
  return (
    <Segmented
      size="sm"
      label="Mode"
      value={value}
      onChange={onChange}
      options={[
        { value: "toggle", label: "Press to start / stop" },
        { value: "hold", label: "While held" },
      ]}
    />
  );
}

function Rate({ value, onChange, max = 50 }: { value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <div className="flex items-center gap-3">
      <Slider label="Per second" min={1} max={max} step={0.5} value={value} onChange={onChange} />
      <NumberField label="Per second" min={0.1} max={1000} value={value} onChange={onChange} suffix="/ s" width="w-20" />
    </div>
  );
}

function AutoClicker({ onAdd }: { onAdd: AddFn }) {
  const [button, setButton] = useState(MOUSE_LEFT);
  const [rate, setRate] = useState(15);
  const [key, setKey] = useState<KeyValue>({ input: 0x76, mods: 0 });
  const [mode, setMode] = useState<TriggerMode>("toggle");
  const [cond, setCond] = useState<Conditions>(NO_CONDITIONS);
  return (
    <Tool
      icon={<MousePointerClick aria-hidden className="size-5" />}
      title="Auto-clicker"
      hint="Clicks for you at a steady rate."
      footer={
        <>
          <span className="mr-auto text-xs text-ink-muted">
            {comboName(key.input, key.mods)} {mode === "toggle" ? "starts / stops" : "held"} → {keyName(button)} {fmtRate(rate)}×/s
          </span>
          <Button variant="primary" disabled={!key.input} onClick={() => onAdd("Auto-clicker", { input: key.input, mods: key.mods, mode }, { type: "rapid", output: button, rate, holdMs: 0, jitterPct: 0 }, undefined, cond)}>
            Add auto-clicker
          </Button>
        </>
      }
    >
      <Field label="Click">
        <Segmented
          label="Button"
          value={String(button)}
          onChange={(v) => setButton(Number(v))}
          options={[
            { value: String(MOUSE_LEFT), label: "Left" },
            { value: String(MOUSE_RIGHT), label: "Right" },
            { value: String(MOUSE_MIDDLE), label: "Middle" },
          ]}
        />
      </Field>
      <Field label="Clicks per second">
        <Rate value={rate} onChange={setRate} />
      </Field>
      <Field label="Start with">
        <KeyField label="Auto-clicker key" value={key} onChange={setKey} quick={[]} />
      </Field>
      <ModePick value={mode} onChange={setMode} />
      <ConditionsQuick value={cond} onChange={setCond} trigger={key.input} toggle={mode === "toggle"} />
    </Tool>
  );
}

function Turbo({ onAdd }: { onAdd: AddFn }) {
  const [key, setKey] = useState<KeyValue>({ input: 0, mods: 0 });
  const [rate, setRate] = useState(12);
  const [cond, setCond] = useState<Conditions>(NO_CONDITIONS);
  return (
    <Tool
      icon={<Repeat2 aria-hidden className="size-5" />}
      title="Turbo key"
      hint="Hold a key or button and it repeats by itself, like a controller's turbo."
      footer={
        <Button variant="primary" disabled={!key.input} onClick={() => onAdd(`Turbo ${keyName(key.input)}`, { input: key.input, mode: "hold" }, { type: "rapid", output: key.input, rate, holdMs: 0, jitterPct: 0 }, undefined, cond)}>
          Add turbo
        </Button>
      }
    >
      <Field label="Key or button">
        <KeyField label="Turbo key" withMods={false} value={key} onChange={setKey} />
      </Field>
      <Field label="Repeats per second">
        <Rate value={rate} onChange={setRate} />
      </Field>
      <ConditionsQuick value={cond} onChange={(c) => setCond({ ...c, whileHeld: c.whileHeld === key.input ? 0 : c.whileHeld })} trigger={key.input} toggle={false} />
    </Tool>
  );
}

function Remap({ onAdd }: { onAdd: AddFn }) {
  const [from, setFrom] = useState<KeyValue>({ input: 0, mods: 0 });
  const [to, setTo] = useState<KeyValue>({ input: 0, mods: 0 });
  return (
    <Tool
      icon={<Shuffle aria-hidden className="size-5" />}
      title="Remap a key"
      hint="Make one key or mouse button act as another, or as a shortcut like Ctrl + C."
      footer={
        <Button
          variant="primary"
          disabled={!from.input || !to.input}
          onClick={() => onAdd(`${comboName(from.input, from.mods)} → ${comboName(to.input, to.mods)}`, { input: from.input, mods: from.mods }, { type: "remap", output: to.input, mods: to.mods })}
        >
          Add remap
        </Button>
      }
    >
      <Field label="When I press">
        <KeyField label="Remap from" value={from} onChange={setFrom} />
      </Field>
      <Field label="Send">
        <KeyField label="Remap to" value={to} onChange={setTo} />
      </Field>
    </Tool>
  );
}

function AutoRun({ onAdd }: { onAdd: AddFn }) {
  const [key, setKey] = useState<KeyValue>({ input: 0, mods: 0 });
  const [held, setHeld] = useState<KeyValue>({ input: 0x57, mods: 0 });
  return (
    <Tool
      icon={<Lock aria-hidden className="size-5" />}
      title="Auto-run / hold lock"
      hint="Press once to keep a key held down (auto-run, auto-sprint, hold to aim). Press again to let go."
      footer={
        <Button variant="primary" disabled={!key.input || !held.input} onClick={() => onAdd(`Hold ${keyName(held.input)}`, { input: key.input, mods: key.mods }, { type: "holdLock", output: held.input })}>
          Add hold lock
        </Button>
      }
    >
      <Field label="Press">
        <KeyField label="Hold lock trigger" value={key} onChange={setKey} />
      </Field>
      <Field label="To hold down">
        <KeyField label="Held key" withMods={false} value={held} onChange={setHeld} />
      </Field>
    </Tool>
  );
}

function ScrollSpam({ onAdd }: { onAdd: AddFn }) {
  const [key, setKey] = useState<KeyValue>({ input: 0x20, mods: 0 });
  const [dir, setDir] = useState(WHEEL_DOWN);
  const [rate, setRate] = useState(30);
  return (
    <Tool
      icon={<ChevronsDown aria-hidden className="size-5" />}
      title="Scroll spam"
      hint="Hold a key to send a stream of scroll-wheel notches."
      footer={
        <Button variant="primary" disabled={!key.input} onClick={() => onAdd("Scroll spam", { input: key.input, mods: key.mods, mode: "hold" }, { type: "rapid", output: dir, rate, holdMs: 0, jitterPct: 0 })}>
          Add scroll spam
        </Button>
      }
    >
      <Field label="While I hold">
        <KeyField label="Scroll spam key" value={key} onChange={setKey} quick={[]} />
      </Field>
      <div className="flex flex-wrap items-end gap-5">
        <Field label="Direction">
          <Segmented
            size="sm"
            label="Direction"
            value={String(dir)}
            onChange={(v) => setDir(Number(v))}
            options={[
              { value: String(WHEEL_DOWN), label: "Down" },
              { value: String(WHEEL_UP), label: "Up" },
            ]}
          />
        </Field>
        <Field label="Notches per second" className="flex-1">
          <Rate value={rate} onChange={setRate} max={100} />
        </Field>
      </div>
    </Tool>
  );
}

function TextSnippet({ onAdd }: { onAdd: AddFn }) {
  const [key, setKey] = useState<KeyValue>({ input: 0, mods: 0 });
  const [text, setText] = useState("");
  const [chat, setChat] = useState(true);
  return (
    <Tool
      icon={<Type aria-hidden className="size-5" />}
      title="Text snippet"
      hint="Type a message with one key. Optionally opens chat with Enter first and sends it after."
      footer={
        <Button
          variant="primary"
          disabled={!key.input || !text.trim()}
          onClick={() => {
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
            onAdd(m.name, { input: key.input, mods: key.mods }, { type: "macro", macroId: m.id, repeat: 1, onRepress: "ignore", stopImmediately: true }, m);
            setText("");
          }}
        >
          Add snippet
        </Button>
      }
    >
      <Field label="Key">
        <KeyField label="Snippet key" value={key} onChange={setKey} quick={[]} />
      </Field>
      <Field label="Text">
        <TextInput label="Snippet text" value={text} onChange={setText} placeholder="gg wp" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={chat} onChange={(e) => setChat(e.target.checked)} className="size-4 accent-violet" />
        Press Enter before and after (game chat)
      </label>
    </Tool>
  );
}

function DisableKey({ onAdd }: { onAdd: AddFn }) {
  const [key, setKey] = useState<KeyValue>({ input: 0, mods: 0 });
  return (
    <Tool
      icon={<Ban aria-hidden className="size-5" />}
      title="Disable a key"
      hint="Stop a key from doing anything, such as the Windows key that drops you to the desktop mid-fight."
      footer={
        <>
          <Button
            onClick={() => {
              onAdd("Disable Left Win", { input: 0x5b }, { type: "block" });
              onAdd("Disable Right Win", { input: 0x5c }, { type: "block" });
            }}
          >
            Disable both Windows keys
          </Button>
          <Button variant="primary" disabled={!key.input} onClick={() => onAdd(`Disable ${keyName(key.input)}`, { input: key.input, mods: key.mods }, { type: "block" })}>
            Disable key
          </Button>
        </>
      }
    >
      <Field label="Key">
        <KeyField label="Key to disable" value={key} onChange={setKey} quick={[]} />
      </Field>
    </Tool>
  );
}
