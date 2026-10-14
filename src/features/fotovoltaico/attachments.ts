export const PHOTOVOLTAICO_MAX_FILE_SIZE = 15 * 1024 * 1024;

type AttachmentLike = Pick<File, "name" | "type" | "size">;

export function validatePhotovoltaicAttachment(category: string, file: AttachmentLike): string | null {
  if (file.size > PHOTOVOLTAICO_MAX_FILE_SIZE) {
    return `${file.name}: dimensione massima 15 MB`;
  }
  if (["fatture_vendita", "schema_unifilare_rivenditore", "schema_unifilare_bozza"].includes(category)
    && (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf"))) {
    return `${file.name}: in questo spazio sono ammessi esclusivamente file PDF`;
  }
  if (category === "schema_unifilare_firmato"
    && !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return `${file.name}: carica un PDF, una scansione o una foto nitida (JPG, PNG o WebP)`;
  }
  return null;
}
