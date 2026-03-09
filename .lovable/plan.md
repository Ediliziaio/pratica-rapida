

# Miglioramento UX Sezione Aziende

## Problemi Identificati (dallo screenshot)

1. Le icone statistiche (pratiche, completate, in corso, utenti) non hanno tooltip — l'utente deve indovinare cosa rappresentano
2. Manca una barra riepilogativa in alto con i totali aggregati
3. Manca il conteggio dei risultati filtrati
4. Nessuna opzione di ordinamento
5. Le aziende con zero pratiche non hanno un indicatore visivo chiaro
6. Su mobile la riga di statistiche e' troppo compressa

## Modifiche Proposte

### File: `src/pages/Aziende.tsx`

| Modifica | Dettaglio |
|----------|-----------|
| **Barra riepilogativa** | Aggiungere sopra la lista: totale aziende, totale pratiche, wallet totale, utenti totali — in 4 mini-card |
| **Tooltip sulle icone** | Wrappare ogni icona statistica con `<Tooltip>` (Pratiche, Completate, In Corso, Utenti) |
| **Conteggio risultati** | Mostrare "4 aziende" o "2 di 4 aziende" sotto la barra di ricerca |
| **Ordinamento** | Aggiungere un `<Select>` accanto alla ricerca con opzioni: Nome, Pratiche, Wallet, Data registrazione |
| **Layout responsive** | Spostare le stats sotto il nome azienda su schermi piccoli con `flex-wrap` e breakpoint migliori |

Nessuna modifica al database. Solo refactor UI del componente Aziende.

