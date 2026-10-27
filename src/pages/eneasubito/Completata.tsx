/**
 * /completa/:token — dove atterra chi ha appena pagato.
 *
 * Non e' una pagina di cortesia e non e' un «grazie, ti scriviamo». Il
 * Titolare ha deciso l'11/10/2026 che dopo il pagamento si continua subito
 * col modulo: il cliente ha appena dato dei soldi, e' sul pezzo, e mandarlo
 * ad aspettare un'e-mail significa perderlo di nuovo. L'e-mail poi non
 * partirebbe nemmeno, perche' questo canale non scrive mai al cliente.
 *
 * Il modulo e' lo stesso che Pratica Rapida usa in produzione tutti i giorni:
 * stessa macchina, stesso token della pratica, soltanto firmato EneaSubito.
 * Qui sopra ci va una riga di conferma del pagamento, e basta.
 */
import { useParams } from "react-router-dom";

import FormPubblico from "@/pages/FormPubblico";
import { ENEASUBITO } from "@/lib/marchio";

export default function Completata() {
  const { token } = useParams();
  return (
    <>
      <div
        style={{
          background: "#0C8842",
          color: "#fff",
          padding: "14px 16px",
          textAlign: "center",
          fontFamily: "'Work Sans Variable', system-ui, sans-serif",
          fontSize: 15,
          lineHeight: 1.5,
        }}
      >
        <strong>Ci siamo.</strong> Nessun addebito adesso: i 99 € li paghi quando ricevi la pratica.
        Completa il modulo qui sotto e la tua pratica parte.
      </div>
      {/* Il modulo si prende il token dall'indirizzo da solo: `token` qui
          serve solo a non montare il modulo quando l'indirizzo e' monco. */}
      {token ? <FormPubblico marchio={ENEASUBITO} /> : null}
    </>
  );
}
