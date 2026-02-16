

# Semplificazione Form Nuova Pratica ENEA

## Cosa cambia

Il wizard attuale ha 3 step (Dati Cliente, Dati Pratica ENEA, Riepilogo). L'utente vuole mantenere solo il primo step con i dati del cliente, eliminando lo step intermedio dei dati tecnici ENEA.

## Modifiche

**File:** `src/pages/NuovaPratica.tsx`

- Ridurre gli step da 3 a 2: **Dati Cliente** e **Riepilogo**
- Rimuovere tutto lo step "Dati Pratica ENEA" (tipo intervento, dati catastali, data fine lavori, importo lavori, note)
- Rimuovere le variabili di stato relative: `tipoIntervento`, `datiCatastali`, `dataFineLavori`, `importoLavori`, `note`
- Aggiornare la validazione `canNext()` rimuovendo il controllo su `tipoIntervento`
- Aggiornare il riepilogo rimuovendo la sezione "Pratica ENEA"
- Aggiornare la mutation `submitPratica` per non includere `dati_pratica` con i campi rimossi
- Aggiornare l'indicatore degli step e la navigazione di conseguenza

Il form risultante avra':
1. **Step 1 - Dati Cliente**: Nome, Cognome, Codice Fiscale, Email, Telefono, Indirizzo
2. **Step 2 - Riepilogo**: Mostra i dati cliente + costo servizio e saldo wallet

