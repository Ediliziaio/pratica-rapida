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
      richiesta={{
        modulo: "fotovoltaico-off-grid",
        conTipoServizio: true,
        prodottoFisso: "Fotovoltaico off-grid",
      }}
      formName="Modulo Rivenditore Fotovoltaico off grid"
    />
  );
}
