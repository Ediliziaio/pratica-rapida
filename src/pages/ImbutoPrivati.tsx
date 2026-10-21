/**
 * /imbuto — dove si ferma il cliente privato che arriva dall'annuncio.
 *
 * Una barra per passo, lunga quanto la quota dei privati che ci arrivano: il
 * punto dove la barra crolla è il punto dove si perde la gente. Si aggiorna
 * da sola ogni due minuti. Non è collegata da nessuna pagina e non va sui
 * motori di ricerca: contiene solo conteggi anonimi.
 */
import { useEffect, useState } from "react";
import { SEO } from "@/components/SEO";

const BASE = import.meta.env.VITE_SUPABASE_URL ?? "";

const NOMI: Record<string, string> = {
  aperto: "Ha aperto la pagina (anche rivenditori)",
  privato: "Ha scelto «Sono un cliente privato»",
  prodotto: "Ha scelto il lavoro",
  nome: "Ha scritto il nome",
  telefono: "Ha scritto il telefono",
  email: "Ha scritto l'e-mail",
  invia: "Ha premuto Invia",
  registrata: "Richiesta registrata",
  modulo: "Ha aperto il modulo dei dati",
  compila: "Ha iniziato a compilare",
  ultima: "È arrivato all'ultima sezione",
  invio: "Ha premuto «Invia e vai al pagamento»",
  pagamento: "È andato sulla pagina di pagamento",
  pagato: "È tornato con il pagamento fatto",
};

interface Riga {
  passo: string;
  visite: number;
  suCentoPrivati: number | null;
}

export default function ImbutoPrivati() {
  const [righe, setRighe] = useState<Riga[] | null>(null);
  const [guasto, setGuasto] = useState(false);
  const [giorni, setGiorni] = useState(7);

  useEffect(() => {
    let vivo = true;
    async function leggi() {
      try {
        const r = await fetch(`${BASE}/functions/v1/modulo-passi?giorni=${giorni}`);
        const d = await r.json();
        if (!vivo) return;
        setRighe(d.imbuto ?? []);
        setGuasto(false);
      } catch {
        if (vivo) setGuasto(true);
      }
    }
    void leggi();
    const orologio = setInterval(leggi, 120_000);
    return () => {
      vivo = false;
      clearInterval(orologio);
    };
  }, [giorni]);

  const privati = righe?.find((r) => r.passo === "privato")?.visite ?? 0;
  const pagato = righe?.find((r) => r.passo === "pagato")?.visite ?? 0;

  return (
    <>
      <SEO title="Dove si fermano | Pratica Rapida" description="Imbuto del cliente privato." canonical="/imbuto" noindex />
      <main className="min-h-screen bg-gray-50 px-4 py-10">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-bold">Dove si fermano i privati</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Si aggiorna da sola ogni due minuti ·{" "}
            {[1, 7, 30].map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGiorni(g)}
                className={`mx-1 underline-offset-2 ${g === giorni ? "font-semibold text-foreground" : "hover:underline"}`}
              >
                {g === 1 ? "ultime 24 ore" : `ultimi ${g} giorni`}
              </button>
            ))}
          </p>

          {guasto && <p className="mt-6 text-sm">Non riesco a leggere i numeri in questo momento.</p>}
          {!righe && !guasto && <p className="mt-6 text-sm">Un momento…</p>}

          {righe && (
            <>
              <table className="mt-6 w-full border-collapse">
                <tbody>
                  {righe.map((r) => (
                    <tr key={r.passo} className="border-b border-gray-200">
                      <td className="whitespace-nowrap py-2.5 pr-3 text-sm sm:text-[15px]">{NOMI[r.passo] ?? r.passo}</td>
                      <td className="w-full py-2.5">
                        <i
                          className="block h-3 rounded-full bg-primary"
                          style={{ width: `${r.suCentoPrivati ?? 0}%`, minWidth: 2 }}
                        />
                      </td>
                      <td className="py-2.5 pl-3 text-right font-semibold tabular-nums">{r.visite}</td>
                      <td className="w-14 py-2.5 text-right tabular-nums text-muted-foreground">
                        {r.suCentoPrivati === null ? "—" : `${r.suCentoPrivati}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
                Il punto dove la barra crolla è il punto dove perdiamo la gente.
                <br />
                {privati
                  ? `Su ${privati} privati, ${pagato} sono tornati con il pagamento fatto.`
                  : "Nessun privato in questo periodo."}
                <br />
                Dal modulo dei dati in poi si conta solo chi lo apre subito, nella stessa scheda: chi torna
                più tardi dal link nell'e-mail non compare.
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}
