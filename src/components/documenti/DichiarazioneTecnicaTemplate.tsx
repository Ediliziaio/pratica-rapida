/**
 * DichiarazioneTecnicaTemplate — anteprima in pagina della "Dichiarazione
 * Requisiti Tecnici".
 *
 * Il markup NON vive qui: arriva da @shared/dichiarazione.ts, lo stesso file
 * che usa l'edge function per generare il documento salvato. Prima il testo
 * era duplicato (una copia in JSX per l'anteprima, una in stringa per il file
 * salvato) e le due potevano divergere — su una dichiarazione sostitutiva di
 * atto di notorietà è esattamente il tipo di divergenza da non avere.
 *
 * Resta un componente React (e non un iframe) perché la stampa dipende da
 * `.printable-area` nel DOM della pagina — vedi index.css.
 */

import { renderDichiarazioneBody, type DichiarazioneTecnicaData } from "@shared/dichiarazione.ts";

export type { DichiarazioneTecnicaData };

interface Props {
  data: DichiarazioneTecnicaData;
}

export default function DichiarazioneTecnicaTemplate({ data }: Props) {
  // Il body è generato da noi da dati nostri (niente input esterno) ed è già
  // HTML-escaped campo per campo dal renderer condiviso.
  return <div dangerouslySetInnerHTML={{ __html: renderDichiarazioneBody(data) }} />;
}
