/**
 * La pagina si monta davvero.
 *
 * Non e' un test di bellezza: il 12/10/2026 una pagina e' andata in produzione
 * bianca perche' le mancava un involucro, e l'avevo controllata leggendo il
 * codice invece di aprirla. Qui la si apre.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const pratiche = [
  {
    id: "1",
    cliente_nome: "Mario",
    cliente_cognome: "Rossi",
    prezzo: 99,
    pagamento_stato: "pagata",
    created_at: new Date().toISOString(),
    provenienza: { gclid: "Cj0" },
  },
  {
    id: "2",
    cliente_nome: "Anna",
    cliente_cognome: "Bianchi",
    prezzo: 99,
    pagamento_stato: "pagata",
    created_at: new Date().toISOString(),
    provenienza: { rinvio: "google.com" },
  },
];

let erroreLettura: { message: string } | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => ({
      select: () => {
        if (tabella === "platform_settings") {
          return {
            eq: () => ({
              maybeSingle: async () => ({
                data: { value: { [chiaveMese()]: { google_annunci: 20 } } },
                error: null,
              }),
            }),
          };
        }
        return {
          eq: () => ({
            gte: () => ({
              lt: async () => ({ data: erroreLettura ? null : pratiche, error: erroreLettura }),
            }),
          }),
        };
      },
      upsert: async () => ({ error: null }),
    }),
  },
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

function chiaveMese(): string {
  const parti = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  return `${parti.find((p) => p.type === "year")?.value}-${parti.find((p) => p.type === "month")?.value}`;
}

let contenitore: HTMLDivElement | null = null;

/**
 * Monta la pagina per davvero in una finestra finta e aspetta che abbia
 * finito di leggere. Niente libreria in piu': bastano React e il suo `act`.
 */
async function montaLaPagina(): Promise<HTMLElement> {
  const { default: Pagina } = await import("./EneaSubitoAcquisizione");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  contenitore = document.createElement("div");
  document.body.appendChild(contenitore);
  const radice = createRoot(contenitore);
  await act(async () => {
    radice.render(
      <QueryClientProvider client={client}>
        <Pagina />
      </QueryClientProvider>,
    );
  });
  // Le due letture (pratiche e spesa) si risolvono subito dopo il montaggio.
  await act(async () => {
    await new Promise((fatto) => setTimeout(fatto, 0));
  });
  return contenitore;
}

/** Cerca un testo nella pagina montata, come lo cercherebbe una persona. */
function testo(dentro: HTMLElement, cercato: string | RegExp): boolean {
  const tutto = dentro.textContent ?? "";
  return typeof cercato === "string" ? tutto.includes(cercato) : cercato.test(tutto);
}

afterEach(() => {
  contenitore?.remove();
  contenitore = null;
});

describe("la pagina dell'acquisizione", () => {
  it("si apre e mostra l'obiettivo del Titolare", async () => {
    erroreLettura = null;
    const pagina = await montaLaPagina();
    expect(testo(pagina, /da dove arrivano i clienti/i)).toBe(true);
    expect(testo(pagina, /3 pratiche al giorno/i)).toBe(true);
    expect(testo(pagina, "20 €")).toBe(true);
  });

  it("divide le pratiche per provenienza e nomina i clienti", async () => {
    erroreLettura = null;
    const pagina = await montaLaPagina();
    expect(testo(pagina, /annuncio a pagamento/i)).toBe(true);
    expect(testo(pagina, /ricerca gratuita/i)).toBe(true);
    expect(testo(pagina, "Mario Rossi")).toBe(true);
    expect(testo(pagina, "Anna Bianchi")).toBe(true);
  });

  it("calcola il costo per pratica con la spesa dichiarata", async () => {
    erroreLettura = null;
    const pagina = await montaLaPagina();
    // 20 € spesi su 1 pratica arrivata dall'annuncio: 20,00 € a pratica.
    expect(testo(pagina, "€ 20.00")).toBe(true);
  });

  // Se la migrazione non e' stata applicata, la pagina deve dire il motivo
  // vero e non un rassicurante «nessuna pratica», che sarebbe una bugia.
  it("dice il motivo vero quando non riesce a leggere", async () => {
    erroreLettura = { message: 'column "provenienza" does not exist' };
    const pagina = await montaLaPagina();
    expect(testo(pagina, 'column "provenienza" does not exist')).toBe(true);
    expect(testo(pagina, "Nessuna pratica EneaSubito")).toBe(false);
  });
});

describe("motivo", () => {
  it("legge il messaggio di un oggetto come quelli di Supabase", async () => {
    const { motivo } = await import("./EneaSubitoAcquisizione");
    expect(motivo({ message: "column does not exist" })).toBe("column does not exist");
  });

  it("legge un Error e una stringa", async () => {
    const { motivo } = await import("./EneaSubitoAcquisizione");
    expect(motivo(new Error("rotto"))).toBe("rotto");
    expect(motivo("rotto")).toBe("rotto");
  });

  // Mai «[object Object]»: sembra un messaggio e non dice niente.
  it("non stampa mai object Object", async () => {
    const { motivo } = await import("./EneaSubitoAcquisizione");
    expect(motivo({ codice: 42 })).not.toContain("[object Object]");
    expect(motivo(null)).toBe("");
  });
});
