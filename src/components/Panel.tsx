// The section frame used by Performance and Settings: the same header as a
// Quick tools builder (accent tile, title, one-line blurb), a body, and an
// optional footer bar.

import type { ReactNode } from "react";

import { cx } from "./ui";

export function Panel({
  id,
  icon,
  title,
  blurb,
  aside,
  children,
  footer,
  glow,
  className,
  bodyClassName,
}: {
  id?: string;
  icon: ReactNode;
  title: ReactNode;
  blurb?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** The soft accent glow behind the icon: for the page's main panel. */
  glow?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section id={id} className={cx("min-w-0 scroll-mt-4 overflow-hidden rounded-2xl border border-line bg-surface-1", className)}>
      <header className={cx("relative flex flex-wrap items-center gap-4 px-6 py-5 texture-grid", children !== undefined && "border-b border-line")}>
        {glow && (
          <span aria-hidden className="pointer-events-none absolute -top-16 -left-10 size-48 rounded-full opacity-20 blur-3xl" style={{ background: "var(--color-violet)" }} />
        )}
        <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-violet text-on-accent shadow-[0_0_30px_-10px_var(--color-violet)]">{icon}</span>
        <div className="relative min-w-0 flex-1">
          <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
          {blurb && <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-ink-muted">{blurb}</p>}
        </div>
        {aside && <div className="relative flex flex-wrap items-center gap-2">{aside}</div>}
      </header>
      {children !== undefined && <div className={cx("px-6 py-5", bodyClassName)}>{children}</div>}
      {footer && <footer className="flex flex-wrap items-center gap-3 border-t border-line bg-surface-0/30 px-6 py-3.5">{footer}</footer>}
    </section>
  );
}

/** A big measured number with a label under it. */
export function Metric({ label, value, unit, hint, tone = "ink" }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode; tone?: "ink" | "lime" | "bad" | "faint" }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface-0/40 px-4 py-3.5">
      <p className="text-[10.5px] font-bold tracking-[0.12em] text-ink-faint uppercase">{label}</p>
      <p
        className={cx(
          "mt-1.5 truncate font-mono text-2xl font-bold tracking-tight tabular-nums",
          tone === "lime" ? "text-lime" : tone === "bad" ? "text-bad" : tone === "faint" ? "text-ink-faint" : "text-ink",
        )}
      >
        {value}
        {unit && <span className="ml-1 text-sm font-semibold text-ink-muted">{unit}</span>}
      </p>
      {hint && <p className="mt-1 truncate text-[11px] text-ink-muted">{hint}</p>}
    </div>
  );
}
