/**
 * CambiaPassword — pagina blocking che l'utente vede quando il super_admin
 * ha forzato una password temporanea. Niente sidebar, niente navigation,
 * un solo form per impostare la nuova password.
 *
 * Flusso:
 *  1. useAuth.mustChangePassword = true → ProtectedRoute reindirizza qui
 *  2. Utente sceglie una nuova password (≥ 8 char, doppia conferma)
 *  3. supabase.auth.updateUser({ password }) aggiorna l'auth
 *  4. RPC clear_must_change_password() azzera il flag in profiles
 *  5. clearMustChangePassword() locale → ProtectedRoute fa unblock
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Lock, ShieldAlert, Eye, EyeOff, Loader2, Check } from "lucide-react";

export default function CambiaPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { clearMustChangePassword, signOut } = useAuth();

  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const validation = (() => {
    if (newPwd.length === 0) return null;
    if (newPwd.length < 8) return "La password deve avere almeno 8 caratteri";
    if (!/[a-zA-Z]/.test(newPwd)) return "La password deve contenere almeno una lettera";
    if (!/\d/.test(newPwd)) return "La password deve contenere almeno un numero";
    if (confirmPwd && newPwd !== confirmPwd) return "Le password non coincidono";
    return null;
  })();

  const canSubmit = newPwd.length >= 8 && newPwd === confirmPwd && !validation && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // Step 1: aggiorna la password tramite Supabase auth
      const { error: updErr } = await supabase.auth.updateUser({ password: newPwd });
      if (updErr) throw updErr;

      // Step 2: azzera il flag must_change_password in profiles
      const { error: clearErr } = await supabase.rpc("clear_must_change_password");
      if (clearErr) {
        console.error("[CambiaPassword] clear_must_change_password failed:", clearErr);
        // non blocking — la password è stata cambiata, ma il flag potrebbe restare.
        // Al prossimo reload il check si rifà.
      }

      clearMustChangePassword();
      toast({ title: "Password aggiornata ✓", description: "Ora puoi accedere al portale." });
      navigate("/", { replace: true });
    } catch (err) {
      const msg = (err as Error).message ?? "Errore aggiornamento password";
      toast({ title: "Errore", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)" }}
    >
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center"
               style={{ background: "hsla(45,100%,55%,0.15)" }}>
            <ShieldAlert className="h-7 w-7" style={{ color: "hsl(45 100% 35%)" }} />
          </div>
          <CardTitle className="text-xl">Cambio password obbligatorio</CardTitle>
          <CardDescription className="mt-1">
            Stai usando una password temporanea fornita dal team Pratica Rapida.
            Scegli una nuova password personale per continuare.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="newpwd">Nuova password *</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="newpwd"
                  type={showPwd ? "text" : "password"}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  className="pl-9 pr-10"
                  autoFocus
                  autoComplete="new-password"
                  required
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
                Min. 8 caratteri, almeno una lettera e un numero.
              </p>
            </div>

            <div>
              <Label htmlFor="confirmpwd">Conferma password *</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="confirmpwd"
                  type={showPwd ? "text" : "password"}
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  className="pl-9 pr-10"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
                {confirmPwd && newPwd === confirmPwd && newPwd.length >= 8 && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600" />
                )}
              </div>
            </div>

            {validation && (
              <p className="text-xs text-destructive">{validation}</p>
            )}

            <Button type="submit" disabled={!canSubmit} className="w-full">
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Aggiornamento…</>
              ) : (
                "Imposta nuova password"
              )}
            </Button>

            <button
              type="button"
              onClick={async () => {
                try { await signOut(); } catch (err) { console.warn("signOut failed:", err); }
                navigate("/auth", { replace: true });
              }}
              className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Esci e rientra in seguito
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
