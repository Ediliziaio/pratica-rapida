import OldPortalFormPage from "@/components/landing/OldPortalFormPage";

export default function VecchioAllaccioFotovoltaico() {
  return (
    <OldPortalFormPage
      title="Pratica Allaccio Fotovoltaico GSE"
      description="La pratica GSE è la procedura obbligatoria per l'attivazione e la corretta gestione degli incentivi legati agli impianti fotovoltaici (Ritiro Dedicato, Scambio sul Posto, contributi e riconoscimenti economici previsti dal Gestore dei Servizi Energetici). Il rivenditore ci affida l'incarico direttamente dal sito. Noi contattiamo il cliente finale, raccogliamo tutta la documentazione tecnica e amministrativa necessaria e, una volta completata, gestiamo l'invio e l'attivazione della pratica GSE entro i tempi previsti, mantenendo aggiornato sia il cliente che il rivenditore."
      bulletIntro="inserisci qui sotto la pratica da gestire"
      bullets={[
        "pratica GSE compilata e trasmessa correttamente;",
        "conferma di avvenuta registrazione/attivazione sul portale GSE;",
        "copia completa della documentazione per il cliente finale e per il rivenditore.",
      ]}
      iframeSrc="https://api.leadconnectorhq.com/widget/form/sCxXf1IPSH9MD36NkHwU"
      iframeId="inline-sCxXf1IPSH9MD36NkHwU"
      iframeHeight={7391}
      formName="Allaccio fotovoltaico"
    />
  );
}
