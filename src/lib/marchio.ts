/**
 * Chi sta parlando al cliente dentro il modulo pubblico.
 *
 * Il modulo a passi e' uno solo e serve due marchi: Pratica Rapida sul suo
 * dominio, EneaSubito sul suo. Cambia soltanto come si firma e dove si chiede
 * aiuto — il funzionamento e' identico, ed e' giusto che lo sia: e' la stessa
 * macchina.
 *
 * Si sceglie **dal pacchetto**, non a tempo di esecuzione: ogni sito importa
 * il proprio e lo passa come proprieta'. Niente lettura del dominio, niente
 * parametro nell'indirizzo. Un interruttore che si puo' girare da fuori
 * finirebbe prima o poi per far comparire un marchio sul sito dell'altro, ed
 * e' esattamente la cosa che non deve succedere.
 */
export interface Marchio {
  /** Come si firma in pagina. */
  nome: string;
  /** Dove si scrive per farsi aiutare. */
  assistenzaEmail: string;
  /** Numero WhatsApp per l'assistenza, oppure null se il marchio non lo offre. */
  whatsapp: string | null;
  /**
   * Il modulo incassa alla fine della compilazione?
   *
   * Su Pratica Rapida si': il cliente finale compila e poi paga, con Fatture
   * in Cloud. Su EneaSubito no, e non e' una preferenza: ha gia' pagato
   * all'inizio, con Stripe e con l'altra societa'. Senza questo interruttore
   * il modulo lo manderebbe a pagare una seconda volta, perche' guarda solo
   * `tipo_fatturazione = cliente_finale`, che e' vero in tutti e due i casi.
   */
  incassaDalModulo: boolean;
}

export const PRATICA_RAPIDA: Marchio = {
  nome: "Pratica Rapida",
  assistenzaEmail: "supporto@praticarapida.it",
  whatsapp: "390398682691",
  incassaDalModulo: true,
};

export const ENEASUBITO: Marchio = {
  nome: "EneaSubito",
  assistenzaEmail: "assistenza@eneasubito.it",
  // Il secondo marchio non ha un numero: la decisione e' che si risponde solo
  // per e-mail, e un numero scritto e mai risposto e' peggio di nessun numero.
  whatsapp: null,
  // Ha gia' pagato 99 € prima di arrivare qui.
  incassaDalModulo: false,
};
