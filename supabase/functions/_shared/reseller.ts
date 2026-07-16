/**
 * Nome azienda da mostrare al CLIENTE FINALE.
 *
 * Le richieste dal sito di un'azienda non ancora in anagrafica vengono
 * parcheggiate sulla company segnaposto PLACEHOLDER_COMPANY, in attesa che il
 * super_admin le abbini al rivenditore giusto. Il segnaposto è un dettaglio
 * interno: al cliente va detto il nome dell'azienda che ha dichiarato di aver
 * fatto l'installazione, altrimenti riceve un "⚠️ Da abbinare — richieste sito
 * ci ha incaricato di gestire la sua pratica" e si spaventa.
 */

// Azienda-contenitore di sistema per le richieste con azienda non riconosciuta.
export const PLACEHOLDER_COMPANY = "⚠️ Da abbinare — richieste sito";

/** True se la company è il segnaposto "da abbinare" (match tollerante: il
 *  nome esatto è cambiato in passato, il CRM usa lo stesso `includes`). */
export function isPlaceholderCompany(ragioneSociale?: string | null): boolean {
  return !!ragioneSociale?.includes("Da abbinare");
}

// Ultima spiaggia: pratiche messe sul segnaposto a mano, senza passare dal form
// pubblico, quindi senza azienda dichiarata. Un nome vuoto renderebbe i template
// ("perché *{{2}}* ci ha incaricato") sgrammaticati; questa dicitura resta neutra
// e regge sia col "lei" del template WhatsApp sia col "tu" dell'email.
const FALLBACK_RESELLER = "l'azienda installatrice";

interface PracticeLike {
  azienda_dichiarata?: string | null;
  companies?: { ragione_sociale?: string | null } | null;
}

/**
 * Ragione sociale da usare nei template diretti al cliente finale.
 * Sul segnaposto ripiega sull'azienda dichiarata nel form pubblico, poi su una
 * dicitura generica: al cliente non deve MAI arrivare il nome del contenitore
 * interno "Da abbinare".
 */
export function resellerDisplayName(practice: PracticeLike): string {
  const company = practice.companies?.ragione_sociale ?? "";
  if (isPlaceholderCompany(company)) {
    return practice.azienda_dichiarata?.trim() || FALLBACK_RESELLER;
  }
  return company;
}
