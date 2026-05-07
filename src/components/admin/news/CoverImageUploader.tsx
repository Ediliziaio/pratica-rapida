import { useRef, useState } from "react";
import { ImageIcon, Upload, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  value: string;
  onChange: (url: string) => void;
}

const MAX_SIZE = 5 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,image/avif";

export default function CoverImageUploader({ value, onChange }: Props) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "File non valido", description: "Seleziona un'immagine", variant: "destructive" });
      return;
    }
    if (file.size > MAX_SIZE) {
      toast({ title: "File troppo grande", description: "Massimo 5 MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `covers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("news-images").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("news-images").getPublicUrl(path);
      onChange(data.publicUrl);
      toast({ title: "Cover caricata" });
    } catch (err) {
      toast({ title: "Errore upload", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label>Cover image</Label>
        <span className="text-[11px] text-muted-foreground">
          PNG/JPG/WebP — max 5 MB · Suggerito 1600×900
        </span>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative rounded-xl overflow-hidden border-2 border-dashed transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : value
              ? "border-border bg-muted/30"
              : "border-border bg-muted/20 hover:bg-muted/40"
        }`}
      >
        {value ? (
          <div className="relative aspect-[16/9] bg-black">
            <img src={value} alt="Cover preview" className="w-full h-full object-cover" />
            {/* Actions overlay */}
            <div className="absolute top-2 right-2 flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 shadow-md bg-white/90 backdrop-blur hover:bg-white"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                Sostituisci
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="h-8 w-8 shadow-md bg-white/90 backdrop-blur hover:bg-white text-destructive"
                onClick={() => onChange("")}
                aria-label="Rimuovi cover"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="aspect-[16/9] w-full flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {uploading ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="text-sm font-medium">Caricamento…</span>
              </>
            ) : (
              <>
                <ImageIcon className="h-10 w-10 opacity-40" />
                <span className="text-sm font-medium">Clicca per caricare o trascina qui un'immagine</span>
                <span className="text-[11px]">.png, .jpg, .webp · max 5 MB</span>
              </>
            )}
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          disabled={uploading}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </div>

      {/* Manual URL field — collapsed by default */}
      <details className="mt-2">
        <summary className="text-[11px] text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
          Oppure inserisci un URL manualmente
        </summary>
        <Input
          className="mt-1.5 font-mono text-xs"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
        />
      </details>
    </div>
  );
}
