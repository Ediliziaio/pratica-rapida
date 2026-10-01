/**
 * Rimpicciolimento delle foto prima di spedirle.
 *
 * Serve perché il caricamento dal modulo pubblico viaggia convertito in testo
 * dentro la chiamata: una foto da telefono di 8 MB ne diventa più di 11 e la
 * chiamata fallisce. E la foto col telefono è proprio la strada che vogliamo
 * rendere facile, perché molti la fattura ce l'hanno solo di carta.
 *
 * I PDF non si toccano: sono già leggeri e rielaborarli rovinerebbe il testo
 * che il lettore deve estrarre.
 */

/** Lato lungo massimo: sopra questa misura una fattura non si legge meglio. */
const LATO_MASSIMO = 2200;

/** Sotto questa dimensione non vale la pena rielaborare niente. */
const SOGLIA_BYTE = 1_500_000;

export interface FotoPronta {
  file: File;
  rimpicciolita: boolean;
  byteIniziali: number;
  byteFinali: number;
}

export async function preparaDocumento(file: File): Promise<FotoPronta> {
  const inalterato: FotoPronta = {
    file,
    rimpicciolita: false,
    byteIniziali: file.size,
    byteFinali: file.size,
  };
  if (!file.type.startsWith("image/") || file.size <= SOGLIA_BYTE) return inalterato;

  try {
    const bitmap = await creaBitmap(file);
    const scala = Math.min(1, LATO_MASSIMO / Math.max(bitmap.width, bitmap.height));
    const larghezza = Math.round(bitmap.width * scala);
    const altezza = Math.round(bitmap.height * scala);

    const tela = document.createElement("canvas");
    tela.width = larghezza;
    tela.height = altezza;
    const pennello = tela.getContext("2d");
    if (!pennello) return inalterato;
    pennello.drawImage(bitmap, 0, 0, larghezza, altezza);

    const blob = await new Promise<Blob | null>((risolvi) =>
      tela.toBlob(risolvi, "image/jpeg", 0.82),
    );
    if (!blob || blob.size >= file.size) return inalterato;

    const nome = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return {
      file: new File([blob], nome, { type: "image/jpeg" }),
      rimpicciolita: true,
      byteIniziali: file.size,
      byteFinali: blob.size,
    };
  } catch {
    // Se il browser non collabora meglio spedire l'originale che bloccare
    // la persona: al massimo fallisce il caricamento, e lo diciamo.
    return inalterato;
  }
}

async function creaBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") return createImageBitmap(file);
  return new Promise((risolvi, rifiuta) => {
    const img = new Image();
    img.onload = () => risolvi(img);
    img.onerror = rifiuta;
    img.src = URL.createObjectURL(file);
  });
}
