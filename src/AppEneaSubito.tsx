/**
 * L'applicazione di EneaSubito: ingresso separato, non passa da App.tsx.
 *
 * Serve a tre cose insieme, tutte chieste dal Titolare:
 *
 *  1. i due marchi non si toccano — qui dentro non viene compilata una riga
 *     dell'altro sito, né nel codice spedito né nella pagina servita;
 *  2. il sito è leggero — un visitatore scarica solo queste pagine, non il
 *     CRM;
 *  3. pubblicare EneaSubito non ridistribuisce l'altro sito: sono due
 *     compilazioni e due deploy distinti.
 *
 * Regola per chi tocca questo file: niente import che tiri dentro pagine o
 * componenti dell'altro marchio. Se serve qualcosa di condiviso, va spostato
 * in un modulo neutro.
 */
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

// Il modulo che si apre dopo il pagamento avvisa con i messaggini in basso
// (documento caricato, bozza salvata, errore di validazione). Senza questo
// non comparirebbero e il cliente non saprebbe se il documento e' arrivato.
import { Toaster } from "@/components/ui/toaster";

const Home = lazy(() => import("./pages/EneaSubito"));
const PaginaIntervento = lazy(() => import("./pages/eneasubito/PaginaIntervento"));
const PaginaLegale = lazy(() => import("./pages/eneasubito/PaginaLegale"));
const Verifica = lazy(() => import("./pages/eneasubito/verifica/Verifica"));
const ModuloFineLavori = lazy(() => import("./pages/eneasubito/ModuloFineLavori"));
const Completata = lazy(() => import("./pages/eneasubito/Completata"));
const NonTrovata = lazy(() => import("./pages/eneasubito/NonTrovata"));

function Attesa() {
  return <div style={{ minHeight: "100vh", background: "#F5F2EC" }} />;
}

export default function AppEneaSubito() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Attesa />}>
        <Routes>
          <Route path="/" element={<Home />} />

          {/* Pagine d'intervento: sono anche le pagine pensate per le
              ricerche. Gli indirizzi erano già quelli del vecchio sito. */}
          <Route path="/infissi" element={<PaginaIntervento slug="infissi" />} />
          <Route path="/schermature-solari" element={<PaginaIntervento slug="schermature-solari" />} />
          <Route path="/pompe-di-calore" element={<PaginaIntervento slug="pompe-di-calore" />} />

          <Route path="/verifica" element={<Verifica />} />
          {/* Dove Stripe riporta chi ha pagato. */}
          <Route path="/completa/:token" element={<Completata />} />

          <Route path="/modulo-fine-lavori" element={<ModuloFineLavori documento="fine-lavori" />} />
          <Route path="/verbale-di-posa" element={<ModuloFineLavori documento="verbale" />} />

          <Route path="/es/privacy" element={<PaginaLegale slug="privacy" />} />
          <Route path="/es/termini" element={<PaginaLegale slug="termini" />} />
          <Route path="/es/cookie" element={<PaginaLegale slug="cookie" />} />

          {/* Rinvii dai vecchi indirizzi del sito WordPress: /climatizzatori
              copriva le pompe di calore, l'area rivenditori su questo marchio
              non esiste più. */}
          <Route path="/climatizzatori" element={<PaginaIntervento slug="pompe-di-calore" />} />
          <Route path="/area-rivenditori" element={<Home />} />
          <Route path="/home" element={<Home />} />

          <Route path="*" element={<NonTrovata />} />
        </Routes>
      </Suspense>
      <Toaster />
    </BrowserRouter>
  );
}
