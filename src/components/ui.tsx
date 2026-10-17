// Shared controls. Button / Card / PageHeader / StatusBadge / Callout /
// Dialog follow PeakTweaks' primitives (src/components/ui/primitives.tsx) so
// the apps look and behave the same; the rest are MacroForge's own.

import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleHelp, Info, Loader2, OctagonX, X } from "lucide-react";

import { comboName, keyName, modsLabel } from "../lib/keys";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

// ------------------------------------------------------------------ Button --

type Variant = "primary" | "go" | "secondary" | "ghost" | "danger";

const VARIANT: Record<Variant, string> = {
  primary: "bg-violet text-white hover:bg-violet-strong disabled:bg-surface-3 disabled:text-ink-faint",
  go: "bg-lime text-black hover:bg-lime-strong disabled:bg-black/30 disabled:text-white/70",
  secondary: "border border-line-strong text-ink hover:bg-surface-2 disabled:text-ink-faint",
  ghost: "text-ink-muted hover:text-ink hover:bg-surface-2 disabled:text-ink-faint",
  danger: "bg-bad/10 text-bad border border-bad/40 hover:bg-bad/20 disabled:border-line disabled:bg-transparent disabled:text-ink-faint",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  busy?: boolean;
  icon?: ReactNode;
  size?: "sm" | "md";
}

export function Button({ variant = "secondary", busy = false, icon, size = "md", className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-bold whitespace-nowrap",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        "transition-colors disabled:cursor-not-allowed",
        VARIANT[variant],
        className,
      )}
    >
      {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, children, className, ...rest }: { label: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        "grid size-8 place-items-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- Surfaces --

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section {...rest} className={cx("rounded-2xl border border-line bg-surface-1 p-5", className)}>
      {children}
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="text-base font-extrabold tracking-tight">{children}</h2>
      {aside && <div className="text-xs text-ink-muted">{aside}</div>}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("text-[10.5px] font-bold tracking-[0.14em] text-ink-faint uppercase", className)}>{children}</p>;
}

// ------------------------------------------------------------------ Status --

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral";

const TONE: Record<Tone, { badge: string; edge: string; icon: string; Icon: typeof Info }> = {
  ok: { badge: "border-ok bg-ok text-black", edge: "border-ok/35", icon: "text-ok", Icon: CheckCircle2 },
  warn: { badge: "border-violet bg-violet text-white", edge: "border-violet/70", icon: "text-violet-soft", Icon: AlertTriangle },
  bad: { badge: "border-bad/50 bg-bad/10 text-bad", edge: "border-bad/50", icon: "text-bad", Icon: OctagonX },
  info: { badge: "border-line-strong text-info", edge: "border-line-strong", icon: "text-info", Icon: Info },
  neutral: { badge: "border-line-strong text-ink-muted", edge: "border-line", icon: "text-ink-muted", Icon: CircleHelp },
};

export function StatusBadge({ tone, children, icon = true }: { tone: Tone; children: ReactNode; icon?: boolean }) {
  const { badge, Icon } = TONE[tone];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-bold whitespace-nowrap", badge)}>
      {icon && <Icon aria-hidden className="size-3.5" />}
      {children}
    </span>
  );
}

export function Callout({ tone, title, children, action }: { tone: Tone; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const { edge, icon, Icon } = TONE[tone];
  return (
    <div role={tone === "bad" ? "alert" : "note"} className={cx("flex gap-3 rounded-2xl border bg-surface-1 p-4", edge)}>
      <Icon aria-hidden className={cx("mt-0.5 size-5 shrink-0", icon)} />
      <div className="min-w-0 flex-1 text-ink">
        <p className="font-bold">{title}</p>
        {children && <div className="mt-1 text-sm text-ink-muted">{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

export function SampleBadge() {
  return (
    <span className="rounded border border-sample/50 bg-sample/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-sample">
      SAMPLE
    </span>
  );
}

/** A lime dot that pulses: something is running right now. */
export function LiveDot({ className }: { className?: string }) {
  return <span aria-hidden className={cx("inline-block size-2 rounded-full bg-lime animate-live", className)} />;
}

// ------------------------------------------------------------------ Keycap --

export function Keycap({ input, mods = 0, className, empty = "Not set" }: { input: number; mods?: number; className?: string; empty?: string }) {
  if (!input) return <span className={cx("keycap border-dashed text-ink-faint", className)}>{empty}</span>;
  return (
    <span className={cx("inline-flex flex-wrap items-center gap-1", className)} aria-label={comboName(input, mods)}>
      {modsLabel(mods).map((m) => (
        <span key={m} className="keycap">
          {m}
        </span>
      ))}
      <span className="keycap">{keyName(input)}</span>
    </span>
  );
}

// ------------------------------------------------------------------ Dialog --

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const items = () => Array.from(node?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    (node?.querySelector<HTMLElement>("[data-autofocus]") ?? items()[0] ?? node)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.body.dataset.capturing) {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const list = items();
      if (list.length === 0) return e.preventDefault();
      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx("flex max-h-[calc(100vh-2rem)] w-full flex-col rounded-2xl border border-line-strong bg-surface-1", wide ? "max-w-3xl" : "max-w-lg")}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 id={titleId} className="text-lg font-extrabold tracking-tight">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-ink-muted hover:bg-surface-2 hover:text-ink">
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <div className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto px-6 py-5 text-sm text-ink-muted">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Inputs --

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-40",
        checked ? "border-lime bg-lime" : "border-line-strong bg-surface-3",
      )}
    >
      <span className={cx("inline-block size-4 rounded-full transition-transform", checked ? "translate-x-6 bg-black" : "translate-x-1 bg-ink-muted")} />
    </button>
  );
}

/** A labelled row with a switch: the settings pattern. */
export function SwitchRow({ title, hint, checked, onChange, disabled }: { title: string; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink">{title}</p>
        {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} label={title} disabled={disabled} />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-fit self-start rounded-lg border border-line-strong bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-md font-bold transition-colors",
            size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3.5 text-sm",
            o.value === value ? "bg-violet text-white" : "text-ink-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A number box that only commits valid numbers, clamped. */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  label,
  className,
  width = "w-24",
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  label: string;
  className?: string;
  width?: string;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(round(value)));
  }, [value, focused]);
  const commit = (t: string) => {
    const n = Number(t.replace(",", "."));
    if (t.trim() !== "" && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
    else setText(String(round(value)));
  };
  return (
    <label className={cx("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap", className)}>
      <span className="sr-only">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          setFocused(false);
          commit(e.target.value);
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const n = Math.min(max, Math.max(min, round(value + (e.key === "ArrowUp" ? step : -step) * (e.shiftKey ? 10 : 1))));
            onChange(n);
            setText(String(n));
          }
        }}
        className={cx("field h-9 text-right font-mono tabular-nums", width)}
      />
      {suffix && <span className="text-xs text-ink-muted">{suffix}</span>}
    </label>
  );
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function Slider({ value, onChange, min, max, step = 1, label }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; label: string }) {
  const fill = ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      aria-label={label}
      className="slider w-full"
      style={{ ["--fill" as string]: `${fill}%` }}
      min={min}
      max={max}
      step={step}
      value={Math.min(max, Math.max(min, value))}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-bold text-ink">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </div>
  );
}

export function TextInput({ value, onChange, placeholder, label, className, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; label: string; className?: string; autoFocus?: boolean }) {
  return (
    <input
      type="text"
      aria-label={label}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      data-autofocus={autoFocus || undefined}
      onChange={(e) => onChange(e.target.value)}
      className={cx("field placeholder:text-ink-faint", className)}
    />
  );
}

export function Select<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; className?: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)} className={cx("field pr-8", className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-xl bg-surface-2 text-violet-soft">{icon}</div>
      <p className="font-bold text-ink">{title}</p>
      {children && <p className="mt-1 max-w-md text-sm text-ink-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
