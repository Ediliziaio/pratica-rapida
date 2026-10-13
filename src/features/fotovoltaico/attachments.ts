export const PHOTOVOLTAICO_MAX_FILE_SIZE = 15 * 1024 * 1024;

type AttachmentLike = Pick<File, "name" | "type" | "size">;

export function validatePhotovoltaicAttachment(category: string, file: AttachmentLike): string | null {
  if (file.size > PHOTOVOLTAICO_MAX_FILE_SIZE) {
    return `${file.name}: dimensione massima 15 MB`;
  }
  if (category === "fatture_vendita" && (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf"))) {
    return `${file.name}: nello spazio fatture sono ammessi esclusivamente file PDF`;
  }
  return null;
}
