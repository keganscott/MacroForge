// The on-screen notice window: transparent, click-through, never focused
// (src-tauri/src/shell.rs). Shows one line when a toggle or the master
// switch changes; Rust hides the window again afterwards.

import "@fontsource-variable/plus-jakarta-sans";
import "./index.css";

import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { getBackend } from "./lib/ipc";
import type { Hud as HudMsg } from "./lib/types";

function Hud() {
  const [msg, setMsg] = useState<(HudMsg & { n: number }) | null>(null);
  useEffect(() => {
    let off = () => {};
    let n = 0;
    void getBackend().then((b) => {
      off = b.onHud((h) => setMsg({ ...h, n: ++n }));
    });
    return () => off();
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg((m) => (m?.n === msg.n ? null : m)), 1400);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <div className="flex h-screen items-center justify-center">
      {msg && (
        <div
          key={msg.n}
          className="flex items-center gap-3 rounded-2xl border px-5 py-3 font-sans text-base font-extrabold tracking-tight text-white shadow-2xl"
          style={{
            background: "rgb(10 10 12 / 0.92)",
            borderColor: msg.on ? "var(--color-lime)" : "var(--color-line-strong)",
            animation: "hud-in 160ms ease-out",
          }}
        >
          <span
            aria-hidden
            className="size-3 rounded-full"
            style={{ background: msg.on ? "var(--color-lime)" : "var(--color-ink-faint)", boxShadow: msg.on ? "0 0 12px var(--color-lime)" : "none" }}
          />
          {msg.text}
        </div>
      )}
      <style>{"@keyframes hud-in{from{opacity:0;transform:translateY(-6px) scale(.97)}to{opacity:1;transform:none}}"}</style>
    </div>
  );
}

createRoot(document.getElementById("hud")!).render(<Hud />);
