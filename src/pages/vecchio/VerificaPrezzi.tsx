import OldPortalFormPage from "@/components/landing/OldPortalFormPage";

export default function VecchioVerificaPrezzi() {
  return (
    <OldPortalFormPage
      title="Verifica Congruità dei Prezzi"
      description="Il servizio di verifica massimali controlla che la fattura dei lavori (infissi, schermature, pergole, ecc.) sia coerente con i limiti di spesa previsti per le detrazioni (50% o 36%) e quindi che sia detraibile senza rischi. Il rivenditore carica la fattura dal sito, noi verifichiamo prezzi, descrizioni e quantità rispetto ai massimali e comunichiamo l'esito entro 48 ore lavorative."
      bulletIntro="Carica qui sotto la fattura da verificare"
      bullets={[
        "esito di conformità ai massimali (OK / da correggere);",
        "eventuali note su come adeguare la fattura;",
        "indicazione del massimale applicabile all'intervento verificato.",
      ]}
      iframeSrc="https://api.leadconnectorhq.com/widget/form/tPrZvb9fWC0FwZJMyIql"
      iframeId="inline-tPrZvb9fWC0FwZJMyIql"
      iframeHeight={1150}
      formName="Verifica congruità dei prezzi"
    />
  );
}
