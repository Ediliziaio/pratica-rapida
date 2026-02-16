

# Modifiche Login e Creazione Super Admin

## 1. Semplificazione pagina Login
Rimuovere il titolo "Pratica Rapida" dalla pagina di login, lasciando solo il logo e la tagline.

**File:** `src/pages/Auth.tsx`
- Rimuovere la riga `<h1>Pratica Rapida</h1>`
- Mantenere solo il logo e il sottotitolo "La tua Pratica ENEA, semplice e veloce"

## 2. Creazione utente Super Admin
Creare l'utente **f.andriciuc@overthemol.com** con ruolo `super_admin`.

Il processo sara':
1. Registrare l'utente tramite la pagina di registrazione dell'app (con email e password forniti)
2. Assegnare il ruolo `super_admin` tramite una migrazione SQL che cerca l'utente per email nella tabella `profiles` e inserisce il ruolo in `user_roles`

**Migrazione SQL:**
```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::app_role
FROM public.profiles
WHERE email = 'f.andriciuc@overthemol.com'
ON CONFLICT (user_id, role) DO NOTHING;
```

**Nota:** Per prima cosa dovrai registrarti sulla pagina di login con l'email `f.andriciuc@overthemol.com` e la password scelta. Dopo la registrazione, la migrazione assegnera' automaticamente il ruolo di super admin.

## Dettagli tecnici

| File | Modifica |
|------|----------|
| `src/pages/Auth.tsx` | Rimuovere `<h1>` con il nome brand |
| Migrazione SQL | Inserire ruolo `super_admin` per l'utente |

