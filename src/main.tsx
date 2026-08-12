import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { loadRootComponent } from "./appBootstrap";
import "./index.css";

// Initialize Sentry after DOM is ready
import { initSentry } from "@/lib/sentry";
if (import.meta.env.PROD) {
  initSentry();
}

const RootApp = lazy(() => loadRootComponent(import.meta.env.DEV, window.location.pathname));

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <Suspense fallback={null}>
      <RootApp />
    </Suspense>
  </HelmetProvider>
);
