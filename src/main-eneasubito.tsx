// Il modulo che si apre dopo il pagamento e' lo stesso di Pratica Rapida ed
// e' scritto con le classi di Tailwind: senza questo foglio di stile
// resterebbe senza vestito. Le pagine di EneaSubito non lo usano — il loro
// stile sta tutto sotto .es-root — ma convivono senza disturbarsi.
import "./index.css";

import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";

import AppEneaSubito from "./AppEneaSubito.tsx";

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <AppEneaSubito />
  </HelmetProvider>,
);
