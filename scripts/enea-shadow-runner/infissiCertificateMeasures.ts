export const INFISSI_CERTIFICATE_MEASURES_VERSION = "apr-infissi-certificate-measures-v1" as const;

/**
 * Legge misure e numero dei serramenti dai certificati dei produttori.
 *
 * Nel lotto del 13/09/2026 nove pratiche si sono fermate su
 * `infissi_dimensions_and_cardinality_missing`. In sei di esse le misure
 * erano stampate in chiaro nei documenti allegati: APR non le vedeva perche'
 * conosceva una sola forma di scrittura, `1200 x 1500`. Su Cappello, dove le
 * quote sono scritte `Largh.: 1177, Alt.: 1497`, ho dichiarato io stesso
 * "nessuna misura" prima che il titolare mi correggesse.
 *
 * Regole del titolare applicate qui:
 *  - conta la superficie in metri quadri **di ogni pezzo**, non la quota al
 *    millimetro: una riga per pezzo, dieci pezzi restano dieci righe;
 *  - l'unica somma ammessa e' dentro il singolo pezzo, quando il certificato
 *    spezza una stessa finestra su piu' misure (Buosi, posizione 001);
 *  - fra misura nuda e misura comprensiva di coprifili si prende la nuda,
 *    perche' ENEA non chiede quella precisione.
 */
export interface InfissiCertificatePiece {
  /** Identificativo della posizione cosi' come stampato sul certificato. */
  position: string;
  description: string;
  widthMm: number | null;
  heightMm: number | null;
  /** Superficie del pezzo in metri quadri, arrotondata a due decimali. */
  surfaceM2: number;
  quantity: number;
}

export type InfissiCertificateFormat =
  | "dop_pos_quantita"
  | "tabella_riga_qta_misure"
  | "dop_ordine_web"
  | "dichiarazione_largh_alt";

export interface InfissiCertificateReading {
  format: InfissiCertificateFormat;
  pieces: InfissiCertificatePiece[];
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const area = (width: number, height: number) => width * height / 1_000_000;
const clean = (value: string) => value.replace(/\s+/g, " ").trim().replace(/[:.,;]+$/, "");
const mm = (value: string) => Number(value.replace(/\./g, ""));

/**
 * Formato DoP con posizioni numerate (Piva Group: Riviera, Biagioni). La
 * misura del serramento e' la riga `da LARG x ALT mm.` che segue la
 * posizione. Nello stesso documento compare anche `Luce passaggio`, che e' il
 * vano di passaggio e non il serramento: non viene mai letta, perche' non ha
 * quella forma.
 */
function readDopPosQuantita(lines: readonly string[]): InfissiCertificatePiece[] {
  const pieces = new Map<string, InfissiCertificatePiece>();
  let current: { position: string; description: string; quantity: number } | null = null;
  for (const line of lines) {
    const header = line.match(/\bPos\.?\s*(\d+)\s+Q\.?t[aà]\s*([\d.,]+)\s*(.*)$/i);
    if (header) {
      const description = header[3].replace(/^\[\d+\]\s*/, "").replace(/Cod\.?\s*Identif\.?\s*Prodotto\s*tipo:\s*/i, "");
      current = { position: header[1], description: clean(description).slice(0, 90), quantity: Number(header[2].replace(",", ".")) || 1 };
      continue;
    }
    const dimension = line.match(/\bda\s+(\d{3,4})\s*[x×]\s*(\d{3,4})\s*mm/i);
    if (!dimension || !current || pieces.has(current.position)) continue;
    const width = mm(dimension[1]); const height = mm(dimension[2]);
    pieces.set(current.position, { position: current.position, description: current.description, widthMm: width, heightMm: height, surfaceM2: round2(area(width, height) * current.quantity), quantity: current.quantity });
  }
  return [...pieces.values()];
}

/**
 * Tabella `Riga Qta Modello - Misure` (SIDEL: Calvacchi). Ogni riga porta la
 * misura nuda e, subito sotto, quella comprensiva di coprifili con i metri
 * quadri gia' stampati. Si legge la nuda, come deciso dal titolare.
 */
function readTabellaRigaQtaMisure(lines: readonly string[]): InfissiCertificatePiece[] {
  const pieces: InfissiCertificatePiece[] = [];
  let current: { position: string; description: string; quantity: number } | null = null;
  for (const line of lines) {
    const header = line.match(/^\s*(\d{1,2})\s+(\d{1,2})\s+((?:Porta)?[Ff]inestra\b.*)$/);
    if (header) {
      current = { position: header[1], description: clean(header[3]).slice(0, 90), quantity: Number(header[2]) || 1 };
      continue;
    }
    const dimension = line.match(/\bda\s+(\d{3,4})\s*[x×]\s*(\d{3,4})\s*[x×]\s*\d{2,4}\b/i);
    if (!dimension || !current) continue;
    const width = mm(dimension[1]); const height = mm(dimension[2]);
    pieces.push({ position: current.position, description: current.description, widthMm: width, heightMm: height, surfaceM2: round2(area(width, height) * current.quantity), quantity: current.quantity });
    current = null;
  }
  return pieces;
}

/**
 * DoP per ordine con posizioni `.../ -001`, `-002`… (EKO-OKNA: Buosi). La
 * stessa pagina compare sette volte in OCR: si contano le posizioni, non le
 * occorrenze. Piu' misure sulla stessa posizione sono lo stesso serramento
 * spezzato in due, e le superfici si sommano — confermato dal titolare.
 */
function readDopOrdineWeb(lines: readonly string[]): InfissiCertificatePiece[] {
  const perPosition = new Map<string, Map<string, { width: number; height: number; seen: number }>>();
  let current: string | null = null;
  for (const line of lines) {
    const marker = line.match(/WEB\/\d{2}\/\d+\s*-\s*(\d{3})/);
    if (marker) { current = marker[1]; if (!perPosition.has(current)) perPosition.set(current, new Map()); }
    if (!current) continue;
    for (const dimension of line.matchAll(/(\d{3,4})\s*[x×]\s*(\d{3,4})/g)) {
      const key = `${dimension[1]}x${dimension[2]}`;
      const known = perPosition.get(current)!.get(key);
      if (known) known.seen += 1;
      else perPosition.get(current)!.set(key, { width: mm(dimension[1]), height: mm(dimension[2]), seen: 1 });
    }
  }
  return [...perPosition.entries()]
    .filter(([, dimensions]) => dimensions.size > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([position, dimensions]) => {
      // La stessa pagina e' passata sotto OCR piu' volte, e una lettura
      // sbagliata di una cifra produce una misura fantasma. Una misura vera
      // ricorre in quasi tutte le copie; un refuso in una sola. Quando le
      // copie sono piu' d'una si tengono solo le misure ricorrenti, cosi' una
      // "529 x 609" letta una volta non diventa un secondo pezzo accanto alla
      // "529 x 669" letta cinque volte (Buosi, posizione 003).
      const observations = [...dimensions.values()];
      const mostSeen = Math.max(...observations.map((item) => item.seen));
      const parts = mostSeen === 1
        ? observations
        : observations.filter((item) => item.seen >= Math.max(2, Math.ceil(mostSeen / 3)));
      const surfaceM2 = round2(parts.reduce((total, part) => total + area(part.width, part.height), 0));
      const single = parts.length === 1 ? parts[0] : null;
      return {
        position,
        description: parts.length > 1 ? `Serramento in ${parts.length} parti` : "Serramento",
        widthMm: single?.width ?? null,
        heightMm: single?.height ?? null,
        surfaceM2,
        quantity: 1,
      };
    });
}

/**
 * Dichiarazione del produttore con righe `POS QTA Pezzi DESCRIZIONE` e quote
 * etichettate `Largh.: N, Alt.: N` (Internorm/Rotondi: Cappello). E' il
 * formato che il 13/09 avevo dichiarato privo di misure.
 */
function readDichiarazioneLarghAlt(lines: readonly string[]): InfissiCertificatePiece[] {
  const pieces: InfissiCertificatePiece[] = [];
  let current: { position: string; description: string; quantity: number } | null = null;
  for (const line of lines) {
    const header = line.trim().match(/^(\d{2,4})\s+([\d,.]+)\s+Pezzi\s+(.*)$/i);
    if (header) {
      current = { position: header[1], description: clean(header[3]).slice(0, 90), quantity: Number(header[2].replace(",", ".")) || 1 };
      continue;
    }
    const dimension = line.match(/Largh\.?:?\s*(\d[\d.]*)\s*,?\s*Alt\.?:?\s*(\d[\d.]*)/i);
    if (!dimension || !current) continue;
    const width = mm(dimension[1]); const height = mm(dimension[2]);
    pieces.push({ position: current.position, description: current.description, widthMm: width, heightMm: height, surfaceM2: round2(area(width, height) * current.quantity), quantity: current.quantity });
    current = null;
  }
  return pieces;
}

const READERS: readonly { format: InfissiCertificateFormat; detect: RegExp; read: (lines: readonly string[]) => InfissiCertificatePiece[] }[] = [
  { format: "dop_ordine_web", detect: /WEB\/\d{2}\/\d+\s*-\s*\d{3}/, read: readDopOrdineWeb },
  { format: "dichiarazione_largh_alt", detect: /Largh\.?:?\s*\d/i, read: readDichiarazioneLarghAlt },
  // Niente \b dopo "à": in JavaScript le lettere accentate non sono
  // caratteri di parola, quindi "Q.tà 1" non verrebbe riconosciuto e solo la
  // variante senza accento passerebbe.
  { format: "dop_pos_quantita", detect: /\bPos\.?\s*\d+\s+Q\.?\s*t[aà]/i, read: readDopPosQuantita },
  { format: "tabella_riga_qta_misure", detect: /Riga\s+Qt[aà]\s+Modello/i, read: readTabellaRigaQtaMisure },
];

/**
 * Riconosce il formato e restituisce un pezzo per riga. Restituisce null solo
 * quando nessun formato noto e' presente o non produce alcuna misura: in quel
 * caso la domanda all'operatore e' legittima (Imperiali, dove il rilievo e'
 * manoscritto e illeggibile).
 */
export function readInfissiCertificateMeasures(text: string): InfissiCertificateReading | null {
  const lines = text.split(/\r?\n/);
  for (const reader of READERS) {
    if (!reader.detect.test(text)) continue;
    const pieces = reader.read(lines);
    if (pieces.length > 0) return { format: reader.format, pieces };
  }
  return null;
}

/** Superficie complessiva, utile solo per i controlli: in ENEA va una riga per pezzo. */
export function totalInfissiCertificateSurfaceM2(reading: InfissiCertificateReading): number {
  return round2(reading.pieces.reduce((total, piece) => total + piece.surfaceM2, 0));
}
