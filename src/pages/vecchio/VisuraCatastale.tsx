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
      richiesta={{
        modulo: "visura-catastale",
        prodottoFisso: "Visura catastale",
        requiresPayment: true,
        priceCents: 3000,
        priceNote: "La visura catastale è un servizio a pagamento (€ 30 IVA inclusa). Al termine della richiesta verrai reindirizzato al pagamento sicuro tramite Stripe.",
        extraFields: [
          { key: "tipo_visura", label: "Tipo visura (per immobile / per soggetto)", required: true, placeholder: "es. per immobile" },
          { key: "comune", label: "Comune dell'immobile", required: true, placeholder: "es. Milano (MI)" },
          { key: "foglio", label: "Foglio", placeholder: "es. 12" },
          { key: "particella", label: "Particella / Mappale", placeholder: "es. 345" },
          { key: "subalterno", label: "Subalterno", placeholder: "es. 7" },
        ],
      }}
      formName="richiesta visura catastale"
    />
  );
}
