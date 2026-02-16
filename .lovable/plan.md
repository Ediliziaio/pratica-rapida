

# Sezioni collassabili per Cliente, Dati Documento e Opzioni

## Cosa viene fatto

Le tre card principali nella parte superiore del form Nuova Fattura (Cliente, Dati Documento, Opzioni) vengono rese collassabili con frecce su/giu nell'header, esattamente come le sezioni Fatturazione Elettronica e Contributi e Ritenute gia implementate.

## Modifiche a `src/pages/NuovaFattura.tsx`

### Nuovi stati collapsible
Aggiungere 3 nuovi stati (tutti aperti di default, a differenza delle sezioni secondarie):
- `openCliente` (default: true)
- `openDatiDocumento` (default: true)  
- `openOpzioni` (default: true)

### Card Cliente (righe 268-314)
- Wrappare con `Collapsible`
- L'header diventa un `CollapsibleTrigger` con icona ChevronUp/ChevronDown
- Il contenuto (ricerca, lista clienti, dettagli) va dentro `CollapsibleContent`

### Card Dati Documento (righe 317-380)
- Wrappare con `Collapsible`
- L'header diventa un `CollapsibleTrigger` con icona freccia
- Tutti i campi (data, numero, numerazione, lingua, valuta, oggetto, note) dentro `CollapsibleContent`

### Card Opzioni (righe 383-444)
- Wrappare con `Collapsible`
- L'header diventa un `CollapsibleTrigger` con icona freccia
- Metodo pagamento, scadenza e sezione opzioni avanzate dentro `CollapsibleContent`

### Pattern utilizzato (identico alle sezioni gia esistenti)
```
<Collapsible open={openCliente} onOpenChange={setOpenCliente}>
  <Card>
    <CollapsibleTrigger asChild>
      <CardHeader className="cursor-pointer flex-row items-center justify-between">
        <CardTitle>Cliente</CardTitle>
        {openCliente ? <ChevronUp /> : <ChevronDown />}
      </CardHeader>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <CardContent>...</CardContent>
    </CollapsibleContent>
  </Card>
</Collapsible>
```

## File coinvolti

| File | Modifica |
|------|----------|
| `src/pages/NuovaFattura.tsx` | Aggiungere 3 stati + wrappare le 3 card con Collapsible |

