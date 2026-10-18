/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { port: 1430, strictPort: true },
  build: {
    target: "es2022",
    outDir: "dist",
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, "index.html") },
    },
  },
  test: { environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"] },
});
