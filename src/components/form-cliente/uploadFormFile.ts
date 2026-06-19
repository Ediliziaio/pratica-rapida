import { supabase } from "@/integrations/supabase/client";

/**
 * Upload di un file dal FORM PUBBLICO (cliente anonimo) tramite la edge
 * function `form-upload` (service role + validazione form_token). Necessario
 * perché il bucket enea-documents non consente INSERT ad `anon` → l'upload
 * diretto dal browser falliva con RLS. Ritorna lo storage path salvato.
 *
 * Nel path AUTENTICATO (staff in ModuloClientePage) si continua a usare
 * l'upload diretto via supabase.storage (vedi i componenti chiamanti).
 */
export async function uploadPublicFormFile(token: string, kind: string, file: File): Promise<string> {
  const content_base64 = await fileToBase64(file);
  const { data, error } = await supabase.functions.invoke("form-upload", {
    body: { token, kind, filename: file.name, content_base64 },
  });
  if (error) throw error;
  const r = data as { success?: boolean; path?: string; error?: string };
  if (!r?.success || !r.path) throw new Error(r?.error ?? "Upload fallito");
  return r.path;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
