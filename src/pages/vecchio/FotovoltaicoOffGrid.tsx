import OldPortalFormPage from "@/components/landing/OldPortalFormPage";

export default function VecchioFotovoltaicoOffGrid() {
  return (
    <OldPortalFormPage
      title="Pratica Fotovoltaico Off Grid"
      description="Un impianto fotovoltaico off-grid è un impianto solare non collegato alla rete, che utilizza l'energia in autonomia (spesso con batterie di accumulo). Per poter usufruire della detrazione prevista è necessario inviare la comunicazione ENEA. Tu ci inoltri la richiesta dal sito, noi completiamo la raccolta dati e, ricevute tutte le informazioni, in 48 ore lavorative prepariamo e ti consegniamo la pratica."
      bulletIntro="inserisci qui sotto i dati per richiedere la gestione della tua pratica"
      bullets={[
        "pratica ENEA off-grid predisposta e trasmessa;",
        "ricevuta ENEA ufficiale pronta per il commercialista;",
        "assistenza sulla documentazione da inviare.",
      ]}
      iframeSrc="https://api.leadconnectorhq.com/widget/form/u5CzuxVck3ZN9ZFSg27x"
      iframeId="inline-u5CzuxVck3ZN9ZFSg27x"
      iframeHeight={1461}
      formName="Modulo Rivenditore Fotovoltaico off grid"
    />
  );
}
