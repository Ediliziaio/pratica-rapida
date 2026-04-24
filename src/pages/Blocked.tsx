import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ShieldOff } from "lucide-react";

export default function Blocked() {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="rounded-full bg-destructive/10 p-6">
            <ShieldOff className="h-12 w-12 text-destructive" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Account sospeso</h1>
          <p className="text-muted-foreground">
            Il tuo account è stato temporaneamente sospeso. Contatta il supporto
            per maggiori informazioni.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Button variant="outline" asChild>
            <a href="mailto:supporto@praticarapida.it">
              Contatta il supporto
            </a>
          </Button>
          <Button variant="ghost" onClick={signOut}>
            Esci
          </Button>
        </div>
      </div>
    </div>
  );
}
