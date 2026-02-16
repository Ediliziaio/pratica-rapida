import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";


export default function Auth() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Errore di accesso", description: error.message, variant: "destructive" });
    } else {
      navigate("/");
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPassword,
      options: {
        emailRedirectTo: window.location.origin,
        data: { nome, cognome },
      },
    });
    setLoading(false);
    if (error) {
      toast({ title: "Errore di registrazione", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Registrazione completata",
        description: "Controlla la tua email per verificare l'account.",
      });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <img src="/impresa-logo.png" alt="Impresa Leggera" className="w-[200px]" />
          <h1 className="font-display text-2xl font-bold">Impresa Leggera</h1>
          <p className="text-sm text-muted-foreground">Meno burocrazia, più business</p>
        </div>

        <Card>
          <Tabs defaultValue="login">
            <CardHeader className="pb-2">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Accedi</TabsTrigger>
                <TabsTrigger value="signup">Registrati</TabsTrigger>
              </TabsList>
            </CardHeader>

            <TabsContent value="login">
              <form onSubmit={handleLogin}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input id="login-email" type="email" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="mario@esempio.it" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input id="login-password" type="password" required value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="••••••••" />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Accesso..." : "Accedi"}
                  </Button>
                </CardContent>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup}>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="nome">Nome</Label>
                      <Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Mario" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cognome">Cognome</Label>
                      <Input id="cognome" required value={cognome} onChange={(e) => setCognome(e.target.value)} placeholder="Rossi" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input id="signup-email" type="email" required value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} placeholder="mario@esempio.it" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input id="signup-password" type="password" required minLength={6} value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} placeholder="Min. 6 caratteri" />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Registrazione..." : "Registrati"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Riceverai un'email di verifica per completare la registrazione.
                  </p>
                </CardContent>
              </form>
            </TabsContent>
          </Tabs>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Impresa Leggera gestisce il flusso documentale e amministrativo.<br />
          Le attività riservate a professionisti abilitati vengono coordinate con partner abilitati.
        </p>
      </div>
    </div>
  );
}
