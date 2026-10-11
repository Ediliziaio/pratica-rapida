import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";

import AppEneaSubito from "./AppEneaSubito.tsx";

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <AppEneaSubito />
  </HelmetProvider>,
);
