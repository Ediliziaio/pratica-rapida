import OldPortalFormPage from "@/components/landing/OldPortalFormPage";

export default function VecchioPraticaEnea() {
  return (
    <OldPortalFormPage
      title="Pratiche ENEA Ecobonus e Bonus Casa"
      description="La pratica ENEA è la comunicazione obbligatoria da inviare entro 90 giorni dalla fine lavori per usufruire delle detrazioni 50% o 36% su infissi, serramenti, schermature e pergole con requisiti. Il rivenditore ci dà l'incarico dal sito, noi contattiamo direttamente il cliente privato, raccogliamo i dati e, una volta completi, in 48 ore lavorative inviamo la pratica ENEA finita al cliente e al rivenditore."
      bulletIntro="inserisci qui sotto la pratica da gestire"
      bullets={[
        "pratica ENEA compilata e inviata;",
        "ricevuta ENEA ufficiale da conservare;",
        "copia per il cliente finale e per il rivenditore.",
      ]}
      iframeSrc="https://api.leadconnectorhq.com/widget/form/QQHfDRgAPOynEERpP5DK"
      iframeId="inline-QQHfDRgAPOynEERpP5DK"
      iframeHeight={2475}
      formName="Modulo Rivenditore"
    />
  );
}
