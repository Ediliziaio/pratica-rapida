

# Eliminazione e Azioni di Gruppo sulle Pratiche

## Panoramica
Aggiungere la possibilita di:
1. **Selezionare pratiche** con checkbox (selezione singola e "seleziona tutte")
2. **Eliminare pratiche** singolarmente o in blocco
3. **Azioni di gruppo**: cambio stato, cambio pagamento, eliminazione massiva
4. Disponibile sia per utenti azienda (`Pratiche.tsx`) che per super admin (`AdminPratiche.tsx`)

## 1. Database — RLS DELETE per pratiche

Attualmente la tabella `pratiche` non ha policy DELETE. Servira una migration:

```sql
-- Aziende possono eliminare le proprie pratiche in bozza
CREATE POLICY "Company users delete own draft practices"
ON public.pratiche FOR DELETE TO authenticated
USING (
  (stato = 'bozza' AND company_id IN (SELECT get_user_company_ids(auth.uid())))
  OR has_role(auth.uid(), 'super_admin')
);
```

Il super admin puo eliminare qualsiasi pratica; le aziende solo quelle in stato `bozza`.

## 2. `src/pages/Pratiche.tsx` — Selezione + Azioni di Gruppo (Azienda)

- Aggiungere stato `selectedIds: Set<string>`
- Checkbox su ogni card nella `ListView` + checkbox "Seleziona tutte" nell'header
- **Barra azioni di gruppo** (visibile quando `selectedIds.size > 0`):
  - "Elimina selezionate" (solo bozze) con `AlertDialog` di conferma
  - "Cambia stato" dropdown
- Pulsante elimina singola (icona Trash) su ogni card (solo bozze)

## 3. `src/pages/AdminPratiche.tsx` — Selezione + Azioni di Gruppo (Admin)

- Stesso pattern di selezione con checkbox
- **Barra azioni di gruppo admin**:
  - "Elimina selezionate" con `AlertDialog`
  - "Cambia stato" dropdown
  - "Cambia pagamento" dropdown
  - "Assegna operatore" dropdown
- Pulsante elimina singola su ogni riga

## 4. `src/components/pratiche/PraticaCard.tsx` — Prop checkbox

Aggiungere props opzionali alla `ListView`:
- `selectable: boolean`
- `selectedIds: Set<string>`
- `onToggle: (id) => void`
- `onDelete: (id) => void`
- `canDelete: (pratica) => boolean`

## Riepilogo file

| File | Modifica |
|------|----------|
| Migration SQL | Policy DELETE su `pratiche` |
| `src/components/pratiche/PraticaCard.tsx` | Checkbox + pulsante elimina nella ListView |
| `src/pages/Pratiche.tsx` | Selezione, barra azioni gruppo, eliminazione |
| `src/pages/AdminPratiche.tsx` | Selezione, barra azioni gruppo admin, eliminazione |

