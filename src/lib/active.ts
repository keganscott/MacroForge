// Is the user looking at MacroForge right now? (Visible and focused.)
// Polling and animation run only then: while you play, the window is in the
// background and should cost the PC nothing.

import { useEffect, useSyncExternalStore } from "react";

const read = () => document.visibilityState === "visible" && document.hasFocus();

function subscribe(cb: () => void) {
  window.addEventListener("focus", cb);
  window.addEventListener("blur", cb);
  document.addEventListener("visibilitychange", cb);
  return () => {
    window.removeEventListener("focus", cb);
    window.removeEventListener("blur", cb);
    document.removeEventListener("visibilitychange", cb);
  };
}

export function useActive(): boolean {
  return useSyncExternalStore(subscribe, read);
}

/** Run `fn` now and every `ms` while the window is active. */
export function useActiveInterval(fn: () => void, ms: number) {
  const active = useActive();
  useEffect(() => {
    if (!active) return;
    fn();
    const t = setInterval(fn, ms);
    return () => clearInterval(t);
  }, [active, ms]);
}
