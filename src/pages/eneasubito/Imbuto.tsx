/**
 * /imbuto — la pagina da lasciare aperta sul monitor.
 *
 * Una barra per passo, lunga quanto la quota di chi ci arriva: il punto dove
 * la barra crolla e' il punto dove si perde la gente, e si vede in un colpo
 * d'occhio senza leggere un numero. Si aggiorna da sola ogni due minuti.
 *
 * Sta sul sito e non nel CRM perche' deve restare aperta su una macchina
 * dedicata a EneaSubito, senza chiedere un accesso ogni volta. Non e'
 * collegata da nessuna pagina e non va sui motori di ricerca: contiene solo
 * conteggi anonimi — nessun nome, nessun indirizzo, niente di una persona —
 * quindi non c'e' niente da proteggere, ma non c'e' nemmeno motivo di
 * mostrarla a chi passa di li'.
 */
import { useEffect, useState } from "react";

import { Guscio } from "./Guscio";

const BASE = import.meta.env.VITE_SUPABASE_URL ?? "";

const NOMI: Record<string, string> = {
  aperto: "Ha aperto il modulo",
  lavoro: "Ha scelto il lavoro",
  nome: "Ha scritto il nome",
  email: "Ha scritto l'e-mail",
  continua: "Ha premuto Continua",
  passo2: "È arrivato al secondo passo",
  fattura: "Ha caricato la fattura",
  pagamento: "È andato al pagamento",
};

interface Riga {
  passo: string;
  visite: number;
  suCentoCheAprono: number | null;
}

export default function Imbuto() {
  const [righe, setRighe] = useState<Riga[] | null>(null);
  const [guasto, setGuasto] = useState(false);
  const [aggiornato, setAggiornato] = useState<Date | null>(null);

  useEffect(() => {
    let vivo = true;
    async function leggi() {
      try {
        const r = await fetch(`${BASE}/functions/v1/eneasubito-passi?giorni=7`);
        const d = await r.json();
        if (!vivo) return;
        setRighe(d.imbuto ?? []);
        setGuasto(false);
        setAggiornato(new Date());
      } catch {
        if (vivo) setGuasto(true);
      }
    }
    void leggi();
    // Ogni due minuti: abbastanza spesso da vedere arrivare la gente,
    // abbastanza di rado da non pesare su niente.
    const orologio = setInterval(leggi, 120_000);
    return () => {
      vivo = false;
      clearInterval(orologio);
    };
  }, []);

  const aperto = righe?.find((r) => r.passo === "aperto")?.visite ?? 0;
  const pagamento = righe?.find((r) => r.passo === "pagamento")?.visite ?? 0;

  return (
    <Guscio
      titolo="Dove si fermano — EneaSubito"
      descrizione="Quante visite raggiungono ogni passo del modulo."
      percorso="/imbuto"
      senzaIndicizzazione
    >
      <div className="es-wrap">
        <div className="es-passo">
          <h1 className="es-domandona es-serif">Dove si fermano</h1>
          <p className="es-aiuto">
            Ultimi 7 giorni · si aggiorna da sola ogni due minuti
            {aggiornato && ` · ultima lettura ${aggiornato.toLocaleTimeString("it-IT")}`}
          </p>

          {guasto && <p className="es-aiuto">Non riesco a leggere i numeri in questo momento.</p>}
          {!righe && !guasto && <p className="es-aiuto">Un momento…</p>}

          {righe && (
            <>
              <table className="es-imbuto">
                <tbody>
                  {righe.map((r) => (
                    <tr key={r.passo}>
                      <td className="es-imbuto-nome">{NOMI[r.passo] ?? r.passo}</td>
                      <td className="es-imbuto-barra">
                        <i style={{ width: `${r.suCentoCheAprono ?? 0}%` }} />
                      </td>
                      <td className="es-imbuto-num">{r.visite}</td>
                      <td className="es-imbuto-quota">
                        {r.suCentoCheAprono === null ? "—" : `${r.suCentoCheAprono}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="es-micro">
                Il punto dove la barra crolla è il punto dove perdiamo la gente.
                <br />
                {aperto
                  ? `Su ${aperto} che hanno aperto il modulo, ${aperto - pagamento} se ne sono andati senza pagare.`
                  : "Nessuno ha ancora aperto il modulo in questo periodo."}
              </p>
            </>
          )}
        </div>
      </div>
    </Guscio>
  );
}
