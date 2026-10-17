import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource/exo-2/500.css";
import "@fontsource/exo-2/800.css";
import "./index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
