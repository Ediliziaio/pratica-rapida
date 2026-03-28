import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, Download, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Database } from "@/integrations/supabase/types";

type VisibilitaDocumento = Database["public"]["Enums"]["visibilita_documento"];

// Accepted MIME types — covers all common document and image formats
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "image/heic", "image/heif", "image/bmp", "image/tiff",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv",
  "application/zip", "application/x-zip-compressed",
  "application/octet-stream",
]);

// File extensions accepted as fallback when MIME is empty/generic
const ALLOWED_EXTENSIONS = new Set([
  "pdf", "jpg", "jpeg", "png", "webp", "heic", "heif", "bmp", "tiff", "tif",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "txt", "csv", "zip",
]);

// accept= string for the file input element
const ACCEPT_ATTR = [
  ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp", ".tiff",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".txt", ".csv", ".zip",
].join(",");

function isFileAllowed(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  // Allow if MIME matches, or if MIME is empty/octet-stream but extension is known
  if (ALLOWED_TYPES.has(file.type)) return true;
  if (!file.type || file.type === "application/octet-stream") return ALLOWED_EXTENSIONS.has(ext);
  return false;
}

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB per file
const MAX_FILES_PER_BATCH = 20; // max files per drag-and-drop

interface DocumentUploadProps {
  praticaId: string;
  companyId: string;
}

interface UploadItem {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

export function DocumentUpload({ praticaId, companyId }: DocumentUploadProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const { data: documenti = [], isLoading } = useQuery({
    queryKey: ["documenti", praticaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documenti")
        .select("*")
        .eq("pratica_id", praticaId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const uploadSingleFile = async (file: File, visibilita: VisibilitaDocumento = "azienda_interno"): Promise<void> => {
    if (!user) throw new Error("Utente non autenticato");

    // Validate size
    if (file.size > MAX_SIZE_BYTES) {
      throw new Error(`"${file.name}" supera il limite di 20 MB`);
    }

    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${companyId}/${praticaId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("documenti")
      .upload(path, file, { upsert: false });
    if (uploadError) throw new Error(`${file.name}: ${uploadError.message}`);

    // Version tracking: count existing docs with the same name
    const existingVersions = documenti.filter((d) => d.nome_file === file.name);
    const nextVersion = existingVersions.length > 0
      ? Math.max(...existingVersions.map((d) => d.versione)) + 1
      : 1;

    const { error: dbError } = await supabase.from("documenti").insert({
      pratica_id: praticaId,
      company_id: companyId,
      caricato_da: user.id,
      nome_file: file.name,
      storage_path: path,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      visibilita,
      versione: nextVersion,
    });
    if (dbError) {
      // Cleanup orphan storage file on DB failure
      await supabase.storage.from("documenti").remove([path]).catch(() => {});
      throw new Error(`${file.name} (DB): ${dbError.message}`);
    }
  };

  const processQueue = useCallback(async (files: File[]) => {
    if (!user) {
      toast({ title: "Errore", description: "Devi essere autenticato per caricare documenti.", variant: "destructive" });
      return;
    }

    const items: UploadItem[] = files.map((f) => ({ file: f, status: "pending" as const }));
    setQueue(items);
    setIsUploading(true);

    let successCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < items.length; i++) {
      setQueue((prev) => prev.map((item, idx) =>
        idx === i ? { ...item, status: "uploading" } : item
      ));
      try {
        await uploadSingleFile(items[i].file);
        setQueue((prev) => prev.map((item, idx) =>
          idx === i ? { ...item, status: "done" } : item
        ));
        successCount++;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Errore sconosciuto";
        setQueue((prev) => prev.map((item, idx) =>
          idx === i ? { ...item, status: "error", error: msg } : item
        ));
        errors.push(msg);
      }
    }

    queryClient.invalidateQueries({ queryKey: ["documenti", praticaId] });
    setIsUploading(false);

    if (errors.length === 0) {
      toast({ title: `${successCount} documento${successCount > 1 ? "i" : ""} caricato${successCount > 1 ? "i" : ""} ✓` });
      // Clear queue after short delay
      setTimeout(() => setQueue([]), 2000);
    } else if (successCount > 0) {
      toast({
        title: `${successCount} file caricati, ${errors.length} falliti`,
        description: errors.slice(0, 2).join("; "),
        variant: "destructive",
      });
    } else {
      toast({ title: "Upload fallito", description: errors[0], variant: "destructive" });
      setTimeout(() => setQueue([]), 4000);
    }
  }, [user, companyId, praticaId, documenti, queryClient, toast]);

  const handleFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;

    // Filter out unsupported types and warn the user
    const allowed: File[] = [];
    const rejected: string[] = [];
    files.forEach((f) => {
      if (isFileAllowed(f)) {
        allowed.push(f);
      } else {
        rejected.push(f.name);
      }
    });
    if (rejected.length > 0) {
      toast({
        title: `${rejected.length} file non supportato${rejected.length > 1 ? "i" : ""}`,
        description: `Tipo non accettato: ${rejected.slice(0, 3).join(", ")}${rejected.length > 3 ? ` e altri ${rejected.length - 3}` : ""}`,
        variant: "destructive",
      });
    }
    if (allowed.length === 0) return;

    if (allowed.length > MAX_FILES_PER_BATCH) {
      toast({
        title: `Troppi file in una volta`,
        description: `Puoi caricare al massimo ${MAX_FILES_PER_BATCH} file alla volta. Ne hai selezionati ${allowed.length}.`,
        variant: "destructive",
      });
      return;
    }
    processQueue(allowed);
  }, [processQueue, toast]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }, [handleFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  }, [handleFiles]);

  const downloadFile = async (storagePath: string, fileName: string) => {
    const { data, error } = await supabase.storage.from("documenti").download(storagePath);
    if (error) {
      toast({ title: "Errore download", description: error.message, variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteDoc = useMutation({
    mutationFn: async (doc: { id: string; storage_path: string }) => {
      await supabase.storage.from("documenti").remove([doc.storage_path]);
      const { error } = await supabase.from("documenti").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documenti", praticaId] });
      toast({ title: "Documento eliminato" });
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Upload progress for queue
  const queueDone = queue.filter((q) => q.status === "done").length;
  const queueProgress = queue.length > 0 ? (queueDone / queue.length) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileText className="h-4 w-4" />
          Documenti
          {documenti.length > 0 && (
            <Badge variant="secondary" className="ml-auto tabular-nums">
              {documenti.length} {documenti.length === 1 ? "file" : "file"}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !isUploading && inputRef.current?.click()}
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-5 transition-colors cursor-pointer ${
            dragOver ? "border-primary bg-primary/5" : isUploading ? "border-muted bg-muted/30 cursor-not-allowed" : "border-border hover:border-primary/40 hover:bg-muted/30"
          }`}
        >
          <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center">
            {isUploading
              ? `Caricamento in corso… (${queueDone}/${queue.length})`
              : <><span>Trascina i file qui o </span><span className="text-primary font-medium">clicca per sfogliare</span></>}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            PDF, immagini, Word, Excel, ZIP · max 20 MB · fino a {MAX_FILES_PER_BATCH} file alla volta
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={handleFileInput}
            disabled={isUploading}
          />
        </div>

        {/* Upload queue progress */}
        {queue.length > 0 && (
          <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span className="font-medium">Upload in corso</span>
              <span className="tabular-nums">{queueDone}/{queue.length}</span>
            </div>
            <Progress value={queueProgress} className="h-1.5" />
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {queue.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {item.status === "done" && <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />}
                  {item.status === "error" && <AlertCircle className="h-3 w-3 text-destructive shrink-0" />}
                  {item.status === "uploading" && (
                    <div className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
                  )}
                  {item.status === "pending" && <div className="h-3 w-3 rounded-full border-2 border-border shrink-0" />}
                  <span className={`truncate ${item.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                    {item.file.name}
                  </span>
                  {item.error && <span className="text-destructive shrink-0 text-[10px]">✗</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* File list */}
        {isLoading ? (
          <div className="flex justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : documenti.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-2">Nessun documento caricato</p>
        ) : (
          <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-0.5">
            {documenti.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 rounded-lg border p-2.5 bg-card hover:bg-muted/30 transition-colors group">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{doc.nome_file}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatSize(doc.size_bytes)}</span>
                    {doc.tipo && <span className="capitalize text-[10px] bg-muted px-1.5 py-0.5 rounded">{doc.tipo}</span>}
                    {doc.versione > 1 && <span>v{doc.versione}</span>}
                    <Badge variant="outline" className="text-[10px] py-0 h-4">
                      {doc.visibilita === "solo_interno" ? "Interno" : "Azienda"}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => downloadFile(doc.storage_path, doc.nome_file)}
                    title="Scarica"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        title="Elimina"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Elimina documento</AlertDialogTitle>
                        <AlertDialogDescription>
                          Stai per eliminare "{doc.nome_file}". Questa azione è irreversibile.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => deleteDoc.mutate({ id: doc.id, storage_path: doc.storage_path })}
                        >
                          Elimina
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
