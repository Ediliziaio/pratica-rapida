import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, Download, Trash2, Eye } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type VisibilitaDocumento = Database["public"]["Enums"]["visibilita_documento"];

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

interface DocumentUploadProps {
  praticaId: string;
  companyId: string;
}

export function DocumentUpload({ praticaId, companyId }: DocumentUploadProps) {
  const { user, roles } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  const isInternalUser = roles.some(r => ["super_admin", "admin_interno", "operatore"].includes(r));

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

  const uploadFile = useCallback(async (file: File, visibilita: VisibilitaDocumento = "azienda_interno") => {
    if (!user) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({ title: "Tipo file non supportato", description: `${file.name} non è un formato valido.`, variant: "destructive" });
      return;
    }
    if (file.size > MAX_SIZE) {
      toast({ title: "File troppo grande", description: "Dimensione massima 10MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${companyId}/${praticaId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("documenti")
        .upload(path, file);
      if (uploadError) throw uploadError;

      // Get next version
      const existingVersions = documenti.filter(d => d.nome_file === file.name);
      const nextVersion = existingVersions.length > 0
        ? Math.max(...existingVersions.map(d => d.versione)) + 1
        : 1;

      const { error: dbError } = await supabase.from("documenti").insert({
        pratica_id: praticaId,
        company_id: companyId,
        caricato_da: user.id,
        nome_file: file.name,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
        visibilita,
        versione: nextVersion,
      });
      if (dbError) throw dbError;

      queryClient.invalidateQueries({ queryKey: ["documenti", praticaId] });
      toast({ title: "Documento caricato" });
    } catch (e: any) {
      toast({ title: "Errore upload", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [user, companyId, praticaId, documenti, queryClient, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(f => uploadFile(f));
  }, [uploadFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(f => uploadFile(f));
    e.target.value = "";
  }, [uploadFile]);

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileText className="h-4 w-4" /> Documenti
          <Badge variant="outline" className="ml-auto">{documenti.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {uploading ? "Caricamento in corso..." : "Trascina i file qui o"}
          </p>
          <label className="mt-2 cursor-pointer">
            <span className="text-sm font-medium text-primary hover:underline">
              Sfoglia file
            </span>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={handleFileInput}
              disabled={uploading}
              accept={ALLOWED_TYPES.join(",")}
            />
          </label>
          <p className="mt-1 text-xs text-muted-foreground">Max 10MB • PDF, immagini, DOC, XLS</p>
        </div>

        {/* File list */}
        {documenti.length > 0 && (
          <div className="space-y-2">
            {documenti.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 rounded-lg border p-3">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{doc.nome_file}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatSize(doc.size_bytes)}</span>
                    <span>v{doc.versione}</span>
                    <Badge variant="outline" className="text-xs">
                      {doc.visibilita === "solo_interno" ? "Interno" : "Azienda"}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => downloadFile(doc.storage_path, doc.nome_file)}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => deleteDoc.mutate({ id: doc.id, storage_path: doc.storage_path })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
