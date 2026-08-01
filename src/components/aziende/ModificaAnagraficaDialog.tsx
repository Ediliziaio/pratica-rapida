/**
 * ModificaAnagraficaDialog — usato dal super_admin nella pagina dettaglio
 * azienda (/aziende/:id) per completare i dati anagrafici del rivenditore.
 *
 * Serve soprattutto ai documenti generati in automatico: la Dichiarazione
 * Tecnica legge da `companies` i campi ragione_sociale, piva, indirizzo,
 * citta, provincia e cap. Se mancano, il documento esce con i buchi.
 * Quei cinque campi sono percio marcati come "servono ai documenti".
 *
 * Lato database non serve nulla di nuovo: la policy "Super admin manages
 * companies" consente gia la scrittura, e il trigger
 * protect_companies_admin_cols lascia passare il super_admin.
 */

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, FileText } from "lucide-react";

export interface AnagraficaAzienda {
  id: string;
  ragione_sociale: string;
  piva?: string | null;
  codice_fiscale?: string | null;
  email?: string | null;
  telefono?: string | null;
  indirizzo?: string | null;
  cap?: string | null;
  citta?: string | null;
  provincia?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: AnagraficaAzienda | null;
}

const CAMPI_VUOTI = {
  ragione_sociale: "",
  piva: "",
  codice_fiscale: "",
  email: "",
  telefono: "",
  indirizzo: "",
  cap: "",
  citta: "",
  provincia: "",
};

type Campi = typeof CAMPI_VUOTI;

/** Controlli leggeri: bloccano solo gli errori evidenti di digitazione. */
function validate(f: Campi): Partial<Record<keyof Campi, string>> {
  const e: Partial<Record<keyof Campi, string>> = {};

  if (!f.ragione_sociale.trim()) {
    e.ragione_sociale = "La ragione sociale è obbligatoria";
  }
  if (f.piva && !/^[0-9]{11}$/.test(f.piva.trim())) {
    e.piva = "La partita IVA è di 11 cifre";
  }
  if (f.cap && !/^[0-9]{5}$/.test(f.cap.trim())) {
    e.cap = "Il CAP è di 5 cifre";
  }
  if (f.provincia && !/^[A-Za-z]{2}$/.test(f.provincia.trim())) {
    e.provincia = "La provincia è la sigla di 2 lettere (es. MI)";
  }
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) {
    e.email = "Indirizzo email non valido";
  }

  return e;
}

/** Definito FUORI dal componente: se stesse dentro, React lo tratterebbe
 *  come un tipo nuovo a ogni render, rimonterebbe l'Input e il cursore
 *  uscirebbe dal campo a ogni lettera digitata. */
function Campo({
  campo,
  label,
  valore,
  errore,
  onChange,
  placeholder,
  perDocumenti,
  maxLength,
}: {
  campo: keyof Campi;
  label: string;
  valore: string;
  errore?: string;
  onChange: (campo: keyof Campi) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  perDocumenti?: boolean;
  maxLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        {label}
        {perDocumenti && (
          <FileText
            className="h-3 w-3 text-muted-foreground"
            aria-label="Serve ai documenti automatici"
          />
        )}
      </Label>
      <Input
        value={valore}
        onChange={onChange(campo)}
        placeholder={placeholder}
        maxLength={maxLength}
        className={errore ? "border-destructive" : ""}
      />
      {errore && <p className="text-xs text-destructive">{errore}</p>}
    </div>
  );
}

export default function ModificaAnagraficaDialog({ open, onOpenChange, company }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<Campi>(CAMPI_VUOTI);
  const [errors, setErrors] = useState<Partial<Record<keyof Campi, string>>>({});

  // Ricarica i valori ogni volta che il dialog si apre, cosi una modifica
  // annullata non resta appiccicata alla riapertura.
  useEffect(() => {
    if (!open || !company) return;
    setForm({
      ragione_sociale: company.ragione_sociale ?? "",
      piva: company.piva ?? "",
      codice_fiscale: company.codice_fiscale ?? "",
      email: company.email ?? "",
      telefono: company.telefono ?? "",
      indirizzo: company.indirizzo ?? "",
      cap: company.cap ?? "",
      citta: company.citta ?? "",
      provincia: company.provincia ?? "",
    });
    setErrors({});
  }, [open, company]);

  const set = (campo: keyof Campi) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [campo]: e.target.value }));
    setErrors((err) => ({ ...err, [campo]: undefined }));
  };

  const salva = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("Nessuna azienda selezionata");

      const { error } = await supabase
        .from("companies")
        .update({
          ragione_sociale: form.ragione_sociale.trim(),
          piva: form.piva.trim(),
          codice_fiscale: form.codice_fiscale.trim().toUpperCase(),
          email: form.email.trim(),
          telefono: form.telefono.trim(),
          indirizzo: form.indirizzo.trim(),
          cap: form.cap.trim(),
          citta: form.citta.trim(),
          provincia: form.provincia.trim().toUpperCase(),
        })
        .eq("id", company.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-detail", company?.id] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast({ title: "Anagrafica aggiornata" });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({
        title: "Salvataggio non riuscito",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trovati = validate(form);
    if (Object.keys(trovati).length > 0) {
      setErrors(trovati);
      return;
    }
    salva.mutate();
  };

  /** Scorciatoia per non ripetere form/errors/set a ogni campo. */
  const props = (campo: keyof Campi) => ({
    campo,
    valore: form[campo],
    errore: errors[campo],
    onChange: set,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Modifica anagrafica</DialogTitle>
            <DialogDescription className="flex items-center gap-1.5">
              I campi con
              <FileText className="h-3 w-3 inline" aria-hidden="true" />
              vengono usati per compilare i documenti in automatico.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2 py-4">
            <div className="sm:col-span-2">
              <Campo {...props("ragione_sociale")} label="Ragione sociale *" placeholder="Nome dell'azienda" perDocumenti />
            </div>

            <Campo {...props("piva")} label="Partita IVA" placeholder="12345678901" maxLength={11} perDocumenti />
            <Campo {...props("codice_fiscale")} label="Codice fiscale" placeholder="Codice fiscale" maxLength={16} />

            <Campo {...props("email")} label="Email" placeholder="azienda@esempio.it" />
            <Campo {...props("telefono")} label="Telefono" placeholder="333 1234567" />

            <div className="sm:col-span-2">
              <Campo {...props("indirizzo")} label="Indirizzo" placeholder="Via, numero civico" perDocumenti />
            </div>

            <Campo {...props("cap")} label="CAP" placeholder="20100" maxLength={5} perDocumenti />
            <Campo {...props("citta")} label="Città" placeholder="Comune" perDocumenti />
            <Campo {...props("provincia")} label="Provincia" placeholder="MI" maxLength={2} perDocumenti />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={salva.isPending}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={salva.isPending}>
              {salva.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salva
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
