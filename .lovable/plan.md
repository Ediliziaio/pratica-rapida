

# Aggiungere contatori pratiche visibili su ogni card azienda

Aggiungere badge/contatori direttamente visibili sulla riga principale di ogni card (senza aprire il pannello), mostrando:
- **Totali**: numero pratiche totali (gia' presente con icona FolderOpen)
- **Completate**: `statoCounts["completata"]` con badge verde
- **Da fare**: somma di bozza + inviata + in_lavorazione + in_attesa_documenti con badge arancione

I dati sono gia' tutti disponibili nell'oggetto `companyStats` -- serve solo aggiungere i badge nella sezione destra della card, accanto all'icona FolderOpen esistente.

## Modifica

**File:** `src/pages/Aziende.tsx`

Nella sezione `<div className="flex items-center gap-4 text-sm">` (righe 209-233), dopo il contatore FolderOpen esistente (riga 210-212), aggiungere due badge colorati:
- Badge verde: `CheckCircle2` icon + count completate
- Badge arancione: `Clock` icon + count da fare (somma stati attivi)

Importare `CheckCircle2` e `Clock` da lucide-react (gia' usati in pratiche-config).

