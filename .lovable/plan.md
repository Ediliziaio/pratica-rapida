

# Rimozione Completa Sezione Fatturazione

La sezione fatturazione va eliminata interamente dall'app. Ecco tutto ciò che verrà rimosso/modificato:

---

## File da Eliminare

| File | Motivo |
|------|--------|
| `src/pages/Fatturazione.tsx` | Pagina lista fatture |
| `src/pages/NuovaFattura.tsx` | Pagina creazione fattura |
| `src/pages/FatturaDetail.tsx` | Pagina dettaglio fattura |

## File da Modificare

| File | Modifica |
|------|----------|
| `src/App.tsx` | Rimuovere le 3 route `/fatturazione`, `/fatturazione/nuova`, `/fatturazione/:id` e i relativi lazy import |
| `src/components/AppSidebar.tsx` | Rimuovere la voce "Fatturazione" da `aziendaItems` e l'import `FileText` |
| `src/pages/AziendaDetail.tsx` | Rimuovere il tab "Fatture", la query `company-fatture`, e l'import `FileText` |

Nessuna modifica al database — le tabelle `fatture` e `fattura_righe` restano nel DB ma non saranno più accessibili dall'interfaccia.

