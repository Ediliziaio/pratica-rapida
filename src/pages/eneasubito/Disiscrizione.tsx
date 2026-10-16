/**
 * /stop/:token — la pagina che si apre cliccando «non voglio piu' messaggi».
 *
 * Un clic solo, nessuna conferma, nessun accesso: chi vuole smettere di
 * ricevere mail deve riuscirci al primo colpo. Ogni passaggio in piu' si
 * traduce in una segnalazione di spam, e quella penalizza il dominio — cioe'
 * fa arrivare meno anche le conferme di pagamento e le pratiche finite.
 *
 * La porta e' aperta anche al ritorno: sotto c'e' il collegamento per
 * riprendere la pratica, perche' chi si toglie dai solleciti puo' comunque
 * voler comprare.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { Guscio } from "./Guscio";

const BASE = import.meta.env.VITE_SUPABASE_URL ?? "";
const CHIAVE = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

type Esito = "in_corso" | "fatto" | "errore";

export default function Disiscrizione() {
  const { token } = useParams();
  const [esito, setEsito] = useState<Esito>("in_corso");

  useEffect(() => {
    let annullato = false;
    (async () => {
      if (!BASE || !token) {
        if (!annullato) setEsito("errore");
        return;
      }
      try {
        const risposta = await fetch(`${BASE}/functions/v1/eneasubito-disiscrizione`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(CHIAVE ? { apikey: CHIAVE, Authorization: `Bearer ${CHIAVE}` } : {}),
          },
          body: JSON.stringify({ token }),
        });
        if (!annullato) setEsito(risposta.ok ? "fatto" : "errore");
      } catch {
        if (!annullato) setEsito("errore");
      }
    })();
    return () => {
      annullato = true;
    };
  }, [token]);

  return (
    <Guscio
      titolo="Messaggi disattivati — EneaSubito"
      descrizione="Non riceverai altri messaggi di ripresa da EneaSubito."
      percorso="/stop"
    >
      <div className="es-wrap">
        <div className="es-passo">
          {esito === "in_corso" && <h1 className="es-domandona es-serif">Un momento…</h1>}

          {esito === "fatto" && (
            <>
              <h1 className="es-domandona es-serif">Fatto</h1>
              <p className="es-aiuto">
                Non ti mandiamo altri messaggi. Resta valida la conferma di pagamento e la consegna
                della pratica, se un giorno deciderai di farla.
              </p>
              <p className="es-aiuto">
                Se hai cambiato idea, la tua pratica è sempre lì:{" "}
                <a href="/verifica">riprendi da dove eri</a>.
              </p>
            </>
          )}

          {esito === "errore" && (
            <>
              <h1 className="es-domandona es-serif">Scrivici e lo facciamo noi</h1>
              <p className="es-aiuto">
                Qualcosa è andato storto. Manda due righe a{" "}
                <a href="mailto:assistenza@eneasubito.it">assistenza@eneasubito.it</a> e ti
                togliamo noi dall'elenco, subito.
              </p>
            </>
          )}
        </div>
      </div>
    </Guscio>
  );
}
