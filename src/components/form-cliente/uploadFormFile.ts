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
  // Chiediamo alla Edge Function un token limitato a un singolo path dopo che
  // ha validato il form_token. Il file viaggia poi direttamente verso Storage:
  // niente conversione base64, niente +33% di peso e niente payload JSON che
  // falliscono su PDF perfettamente validi vicino al limite dichiarato.
  const { data, error } = await supabase.functions.invoke("form-upload", {
    body: {
      action: "create_signed_upload",
      token,
      kind,
      filename: file.name,
      size: file.size,
      content_type: file.type || "application/octet-stream",
    },
  });
  if (error) throw error;
  const r = data as { success?: boolean; path?: string; upload_token?: string; error?: string };
  if (!r?.success || !r.path || !r.upload_token) {
    throw new Error(r?.error ?? "Impossibile preparare il caricamento");
  }

  const { error: uploadError } = await supabase.storage
    .from("enea-documents")
    .uploadToSignedUrl(r.path, r.upload_token, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadError) throw uploadError;
  return r.path;
}
