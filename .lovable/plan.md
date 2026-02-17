

# Inserimento Dati di Esempio

Inseriro' dati demo nel database usando query SQL dirette (tramite lo strumento di inserimento dati). Nessun file di codice verra' modificato.

## Dati da inserire

### 3 Aziende
1. **Studio Rossi & Associati** - studio professionale
2. **Edilizia Moderna SRL** - impresa edile
3. **Finanza Facile SPA** - consulenza finanziaria

### 9 Clienti (3 per azienda)
Per ogni azienda, 3 clienti finali con dati realistici italiani (nome, cognome, email, codice fiscale, telefono).

### 9 Pratiche (3 per azienda, in stati diversi)
Per ogni azienda, 3 pratiche distribuite su stati diversi:

| Azienda | Pratica 1 | Pratica 2 | Pratica 3 |
|---------|-----------|-----------|-----------|
| Studio Rossi | Bozza | In Lavorazione | Completata |
| Edilizia Moderna | Inviata | In Attesa Documenti | Completata |
| Finanza Facile | Bozza | In Lavorazione | Annullata |

Ogni pratica avra' categoria, prezzo e priorita' variati per rendere i dati realistici. L'utente super admin esistente (`1067905a-...`) sara' usato come `creato_da`.

## Dettagli tecnici

- Le 3 aziende vengono inserite nella tabella `companies`
- L'utente super admin viene assegnato a tutte e 3 le aziende tramite `user_company_assignments`
- I 9 clienti vengono inseriti in `clienti_finali` con il rispettivo `company_id`
- Le 9 pratiche vengono inserite in `pratiche` con riferimenti a company, cliente e creato_da

