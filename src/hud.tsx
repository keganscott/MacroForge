// The on-screen notice window: transparent, click-through, never focused
// (src-tauri/src/shell.rs). Shows one line when a toggle or the master
// switch changes; Rust hides the window again afterwards.

import "@fontsource-variable/plus-jakarta-sans";
import "./index.css";

import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { LogoMark } from "./components/brand";
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
          className="flex items-center gap-3 rounded-2xl border py-2.5 pr-3 pl-3 font-sans text-[15px] font-extrabold tracking-tight text-white"
          style={{
            background: "rgb(8 8 10 / 0.94)",
            borderColor: msg.on ? "color-mix(in srgb, var(--color-violet) 70%, transparent)" : "var(--color-line-strong)",
            boxShadow: msg.on ? "0 0 28px -8px var(--color-violet)" : "none",
            animation: "hud-in 160ms ease-out",
          }}
        >
          <LogoMark className="size-6" off={!msg.on} />
          {/* The chip says on / off, so the words need not. */}
          <span>{msg.text.replace(/ (on|off)$/i, "")}</span>
          <span
            className="ml-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider"
            style={msg.on ? { background: "var(--color-lime)", color: "#000" } : { border: "1px solid var(--color-line-strong)", color: "var(--color-ink-muted)" }}
          >
            {msg.on ? "ON" : "OFF"}
          </span>
        </div>
      )}
      <style>{"@keyframes hud-in{from{opacity:0;transform:translateY(-6px) scale(.97)}to{opacity:1;transform:none}}"}</style>
    </div>
  );
}

createRoot(document.getElementById("hud")!).render(<Hud />);
