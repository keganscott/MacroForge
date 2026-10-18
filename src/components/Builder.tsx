// The frame every Quick tool is built in: a header that says what the tool
// is, numbered steps, and a footer bar with a plain-English summary of what
// will happen and the Add button. Plus the shared optional on / off key step.

import { useState, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, Power } from "lucide-react";

import { KeyField, type KeyValue } from "./KeyField";
import { Button, cx } from "./ui";
import { MOUSE_LEFT, MOUSE_RIGHT } from "../lib/keys";
import type { Action, Conditions, Hotkey, Macro, Trigger } from "../lib/types";
import { toast } from "../store";

export interface AddSpec {
  name: string;
  trigger: Partial<Trigger> & { input: number };
  action: Action;
  macro?: Macro;
  conditions?: Conditions;
  toggleKey?: Hotkey;
}

export type AddFn = (spec: AddSpec) => void;

export function Builder({
  icon,
  title,
  blurb,
  children,
  summary,
  addLabel,
  canAdd,
  onAdd,
  extraAction,
  profileName,
  onOpenBindings,
}: {
  icon: ReactNode;
  title: string;
  blurb: string;
  children: ReactNode;
  /** What pressing Add will set up, in a sentence. */
  summary: ReactNode;
  addLabel: string;
  canAdd: boolean;
  onAdd: () => void;
  extraAction?: ReactNode;
  profileName: string;
  onOpenBindings: () => void;
}) {
  const [added, setAdded] = useState(0);
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface-1">
      <header className="relative flex items-start gap-4 border-b border-line px-7 py-6 texture-grid">
        <span aria-hidden className="pointer-events-none absolute -top-16 -left-10 size-48 rounded-full opacity-20 blur-3xl" style={{ background: "var(--color-violet)" }} />
        <span className="relative grid size-12 shrink-0 place-items-center rounded-xl bg-violet text-on-accent shadow-[0_0_30px_-8px_var(--color-violet)]">{icon}</span>
        <div className="relative min-w-0">
          <h2 className="text-2xl font-extrabold tracking-tight">{title}</h2>
          <p className="mt-1 max-w-xl text-sm text-ink-muted">{blurb}</p>
        </div>
      </header>

      <div className="flex flex-col gap-7 px-7 py-6">{children}</div>

      <footer className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-line bg-surface-1/95 px-7 py-4 backdrop-blur">
        <div className="min-w-0 flex-1 text-sm">
          {added > 0 ? (
            <span key={added} className="inline-flex items-center gap-2 font-bold text-lime">
              <CheckCircle2 aria-hidden className="size-4" /> Added to {profileName}.
              <button type="button" onClick={onOpenBindings} className="inline-flex items-center gap-1 font-bold text-ink hover:underline">
                See it in Bindings <ArrowRight aria-hidden className="size-3.5" />
              </button>
            </span>
          ) : (
            <span className="text-ink-muted">{summary}</span>
          )}
        </div>
        {extraAction}
        <Button
          variant="primary"
          disabled={!canAdd}
          onClick={() => {
            onAdd();
            setAdded((n) => n + 1);
          }}
        >
          {addLabel}
        </Button>
      </footer>
    </section>
  );
}

/** A numbered step inside a builder. */
export function Step({ n, title, hint, optional, children }: { n?: number; title: string; hint?: ReactNode; optional?: boolean; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[2rem_1fr] gap-x-4">
      <span className="grid size-7 place-items-center rounded-lg bg-surface-3 font-mono text-xs font-bold text-ink-muted">{n ?? <span className="size-1.5 rounded-full bg-ink-faint" />}</span>
      <div className="min-w-0">
        <p className="flex items-center gap-2 pt-0.5 text-sm font-extrabold tracking-tight">
          {title}
          {optional && <span className="text-xs font-semibold text-ink-faint">optional</span>}
        </p>
        {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

/** The optional per-binding on / off key, as a builder step. */
export function OnOffKeyStep({ n, value, onChange, trigger }: { n?: number; value: KeyValue; onChange: (v: KeyValue) => void; trigger: number }) {
  return (
    <Step
      n={n}
      optional
      title="On / off key"
      hint="Press it in game to turn just this one off and on again. Your other bindings keep working."
    >
      <div className={cx("flex flex-wrap items-center gap-3 rounded-xl border p-3", value.input ? "border-violet/50 bg-violet/[0.06]" : "border-line")}>
        <Power aria-hidden className={cx("size-4 shrink-0", value.input ? "text-violet" : "text-ink-faint")} />
        <KeyField
          label="On / off key"
          value={value}
          quick={[]}
          onChange={(v) => {
            if (v.input === MOUSE_LEFT || v.input === MOUSE_RIGHT) {
              toast("Left and right click can’t be an on / off key: every click would toggle it.");
              return;
            }
            if (v.input === trigger) {
              toast("That is the key that starts it; pick a different on / off key.");
              return;
            }
            onChange(v);
          }}
        />
        {value.input !== 0 && (
          <button type="button" className="text-xs font-bold text-ink-muted hover:text-ink" onClick={() => onChange({ input: 0, mods: 0 })}>
            Remove
          </button>
        )}
      </div>
    </Step>
  );
}

export const NO_KEY: KeyValue = { input: 0, mods: 0 };
