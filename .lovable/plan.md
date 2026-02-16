
# Assegnazione Operatore in Admin Pratiche + Creazione Utenti Super Admin

## 1. Assegnazione operatore inline nella pagina Admin Pratiche

Nella lista pratiche di `/admin/pratiche`, ogni riga mostrera' un **Select** per assegnare/cambiare l'operatore (assegnatario) direttamente, senza entrare nel dettaglio.

### Comportamento
- Accanto al selettore di stato, apparira' un Select con la lista degli operatori interni (utenti con ruolo `super_admin`, `admin_interno` o `operatore`)
- L'operatore corrente viene pre-selezionato; se non assegnato mostra "Non assegnato"
- Cambiando il valore, viene eseguito un update su `pratiche.assegnatario_id`
- Toast di conferma dopo l'assegnazione
- Nella pipeline view, l'operatore assegnato viene mostrato nella card

### Query aggiuntiva
- Caricare tutti i profili interni: query su `user_roles` per trovare utenti con ruolo `super_admin`/`admin_interno`/`operatore`, poi join con `profiles` per nome e cognome

## 2. Creazione nuovi utenti Super Admin

Aggiungere un bottone "Nuovo Utente" nella pagina Admin Pratiche (o meglio, nella pagina Utenti che e' gia' la sezione Impostazioni) che apre un dialog per creare un nuovo utente con ruolo super_admin.

### Implementazione
- Creare una **edge function** `create-user` che usa il `supabase-admin` (service role) per:
  1. Creare l'utente con `supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nome, cognome } })`
  2. Inserire il ruolo nella tabella `user_roles`
- Questo e' necessario perche' la creazione di utenti lato client (`signUp`) richiede conferma email e fa logout dell'utente corrente. Usando l'admin API nella edge function, il super admin puo' creare utenti senza disconnettersi.

### UI - Dialog nella pagina Utenti (`/utenti`)
- Bottone "Nuovo Utente" nell'header della pagina
- Dialog con form: Nome, Cognome, Email, Password, Ruolo (select con tutti i ruoli disponibili)
- Alla submit, chiama la edge function `create-user`
- Dopo il successo, invalida le query per aggiornare la lista

### Sicurezza Edge Function
- La funzione verifica che chi chiama sia un super_admin controllando il JWT token e verificando il ruolo nel database
- Usa il service role key solo lato server

## Dettagli tecnici

| File | Modifica |
|------|----------|
| `src/pages/AdminPratiche.tsx` | Aggiungere query operatori interni, Select assegnatario inline nella lista e nella pipeline |
| `src/pages/Utenti.tsx` | Aggiungere bottone "Nuovo Utente" e Dialog con form di creazione |
| `supabase/functions/create-user/index.ts` | **Nuovo** - Edge function per creare utenti con admin API |
| `supabase/config.toml` | Aggiungere config per la nuova funzione con `verify_jwt = false` |

### Edge Function `create-user`
- Riceve: `{ email, password, nome, cognome, role }`
- Verifica autenticazione e ruolo super_admin del chiamante
- Crea utente con `auth.admin.createUser`
- Inserisce ruolo in `user_roles`
- Restituisce il profilo creato

### Select operatore (AdminPratiche)
- Query: carica profili che hanno un ruolo interno tramite join `user_roles` + `profiles`
- Select inline con opzione "Non assegnato" + lista operatori
- Mutation: `supabase.from("pratiche").update({ assegnatario_id }).eq("id", praticaId)`
