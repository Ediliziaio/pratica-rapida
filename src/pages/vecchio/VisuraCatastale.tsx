import OldPortalFormPage from "@/components/landing/OldPortalFormPage";

export default function VecchioVisuraCatastale() {
  return (
    <OldPortalFormPage
      title="Richiesta Visura Catastale"
      description="La visura catastale è il documento ufficiale dell'Agenzia delle Entrate – Catasto che riporta i dati identificativi e reddituali di un immobile o terreno (intestatari, foglio, particella, subalterno, categoria, rendita catastale). Ha validità 12 mesi: dopo questo periodo è consigliabile richiederne una aggiornata perché i dati catastali possono cambiare. Con il servizio online di PraticaRapida la ottieni in meno di 24 ore lavorative."
      bulletIntro="Compila il modulo per richiedere la tua visura"
      bullets={[
        "visura catastale ufficiale Agenzia delle Entrate;",
        "dati completi dell'immobile/terreno (intestatari e rendita);",
        "documento in formato digitale pronto da inviare a tecnico, notaio o commercialista.",
      ]}
      iframeSrc="https://api.leadconnectorhq.com/widget/form/bCcXKz5pjboI1hePxICL"
      iframeId="inline-bCcXKz5pjboI1hePxICL"
      iframeHeight={1144}
      formName="richiesta visura catastale"
    />
  );
}
