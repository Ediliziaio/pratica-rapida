import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";

// Initialize Sentry after DOM is ready
import { initSentry } from "@/lib/sentry";
if (import.meta.env.PROD) {
  initSentry();
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
