/**
 * ChangeCompanyPasswordDialog — usato dal super_admin nella pagina dettaglio
 * azienda (/aziende/:id) per impostare manualmente una password temporanea
 * per l'account azienda_admin di quella company.
 *
 * Dopo il submit:
 *  - L'edge function `set-company-password` aggiorna la password via auth.admin
 *  - Imposta profiles.must_change_password = true per il target user
 *  - Al primo login con quella password l'utente azienda verrà reindirizzato
 *    a /cambia-password (vedi App.tsx ProtectedRoute + ForcedPasswordChangeRoute)
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  KeyRound, Eye, EyeOff, Loader2, RefreshCw, Copy, Check, ShieldAlert,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: { id: string; ragione_sociale: string; email?: string | null } | null;
}

/** Genera password "leggibile" di 12 caratteri (lettere + cifre) — niente
 *  caratteri ambigui (O/0/I/l/1) per ridurre errori di digitazione vocale. */
function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 12; i++) s += chars[arr[i] % chars.length];
  return s;
}

export default function ChangeCompanyPasswordDialog({ open, onOpenChange, company }: Props) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [copied, setCopied] = useState(false);
  const [resultEmail, setResultEmail] = useState<string | null>(null);

  const reset = () => {
    setPassword("");
    setShowPwd(false);
    setCopied(false);
    setResultEmail(null);
  };

  const setMut = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("Nessuna azienda selezionata");
      if (password.length < 8) throw new Error("Password minimo 8 caratteri");
      const { data, error } = await supabase.functions.invoke("set-company-password", {
        body: { company_id: company.id, new_password: password },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as { success: boolean; user_id: string; email: string | null };
    },
    onSuccess: (data) => {
      setResultEmail(data.email);
      toast({
        title: "Password aggiornata ✓",
        description: "L'azienda dovrà cambiare password al prossimo accesso.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const handleClose = (next: boolean) => {
    if (!next) {
      onOpenChange(false);
      setTimeout(reset, 300);
    } else {
      onOpenChange(true);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Impossibile copiare", description: "Copia manualmente", variant: "destructive" });
    }
  };

  if (!company) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Cambia password azienda
          </DialogTitle>
          <DialogDescription>
            Imposta una password temporanea per <strong>{company.ragione_sociale}</strong>.
            Al primo login l'utente sarà costretto a cambiarla.
          </DialogDescription>
        </DialogHeader>

        {resultEmail ? (
          /* ── Success state ──────────────────────────────────────────── */
          <div className="py-2 space-y-4">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
              <p className="text-sm font-semibold text-emerald-900 mb-2 flex items-center gap-1.5">
                <Check className="h-4 w-4" />Password impostata correttamente
              </p>
              <p className="text-xs text-emerald-800 leading-relaxed">
                Comunica queste credenziali all'azienda. Al primo accesso il portale
                la costringerà a scegliere una nuova password personale.
              </p>
            </div>

            <div className="space-y-2">
              <div>
                <Label className="text-[11px] text-muted-foreground">Email accesso</Label>
                <Input value={resultEmail} readOnly className="font-mono text-sm bg-muted/50" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Password temporanea</Label>
                <div className="flex gap-2">
                  <Input value={password} readOnly className="font-mono text-sm bg-muted/50" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopy}
                    aria-label="Copia password"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <Button onClick={() => handleClose(false)} className="w-full">Chiudi</Button>
          </div>
        ) : (
          /* ── Form state ─────────────────────────────────────────────── */
          <div className="py-2 space-y-4">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900 leading-relaxed">
                Questa azione sovrascrive la password attuale dell'account azienda
                e lo costringe a cambiarla al prossimo login. Usalo solo se l'utente
                ha smarrito le credenziali e non riesce a usare il reset via email.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="company-pwd">Nuova password temporanea *</Label>
                <button
                  type="button"
                  onClick={() => setPassword(generatePassword())}
                  className="text-[11px] font-medium text-primary hover:underline inline-flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" />Genera sicura
                </button>
              </div>
              <div className="relative">
                <Input
                  id="company-pwd"
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 caratteri"
                  className="pr-10 font-mono"
                  autoComplete="off"
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPwd ? "Nascondi password" : "Mostra password"}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Suggerimento: usa "Genera sicura" per creare una password di 12 caratteri.
              </p>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => handleClose(false)} disabled={setMut.isPending}>
                Annulla
              </Button>
              <Button
                onClick={() => setMut.mutate()}
                disabled={password.length < 8 || setMut.isPending}
              >
                {setMut.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Impostazione…</>
                ) : (
                  <>Imposta password</>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
