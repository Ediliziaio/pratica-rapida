

# Correzione Sidebar Super Admin e Setup Utente

## Problemi identificati

1. **Profilo mancante**: L'utente `f.andriciuc@overthemol.com` esiste nel sistema di autenticazione ma non ha un profilo nella tabella `profiles` (probabilmente registrato prima che il trigger automatico fosse attivo)
2. **Ruolo non assegnato**: Non ha il ruolo `super_admin` nella tabella `user_roles`
3. **Sidebar non corretta**: La sidebar mostra solo "Area Azienda" invece delle sezioni da super admin

## Cosa faremo

### 1. Migrazione SQL
Creare il profilo mancante e assegnare il ruolo `super_admin`:

```sql
-- Creare il profilo mancante
INSERT INTO public.profiles (id, email, nome, cognome)
SELECT id, email, '', ''
FROM auth.users
WHERE email = 'f.andriciuc@overthemol.com'
ON CONFLICT (id) DO NOTHING;

-- Assegnare il ruolo super_admin
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::app_role
FROM auth.users
WHERE email = 'f.andriciuc@overthemol.com'
ON CONFLICT (user_id, role) DO NOTHING;
```

### 2. Aggiornare la Sidebar per Super Admin
Modificare `src/components/AppSidebar.tsx` per mostrare al super admin le voci richieste:

**Sezione Super Admin:**
- Dashboard (/)
- Aziende (/aziende)
- Attivita' (/coda-pratiche) -- rinominata da "Coda Pratiche"
- Impostazioni (/utenti) -- pagina gestione utenti/ruoli

Il super admin potra' anche accedere all'area azienda tramite il meccanismo di impersonation gia' presente.

### 3. Aggiornare le Routes
Aggiungere la route `/impostazioni` se necessario, oppure riutilizzare `/utenti` rinominandola.

## Dettagli tecnici

| File | Modifica |
|------|----------|
| Migrazione SQL | Creare profilo + assegnare ruolo super_admin |
| `src/components/AppSidebar.tsx` | Aggiornare le voci del menu super admin: Dashboard, Aziende, Attivita', Impostazioni |

La logica della sidebar gia' gestisce la visibilita' delle sezioni in base ai ruoli (`showSuperAdmin`, `showInternal`). Servira' solo aggiornare gli array di voci menu.
