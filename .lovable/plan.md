

# Inserimento Logo Pratica Rapida

## Cosa faremo

1. **Copiare il logo** nel progetto come `public/pratica-rapida-logo.png` (va nel public perche' e' usato anche in index.html/meta tags)

2. **Aggiornare i riferimenti al logo** in:
   - `src/pages/Auth.tsx` - schermata di login
   - `src/components/AppSidebar.tsx` - sidebar

3. **Sostituire** tutti i riferimenti a `/impresa-logo.png` con `/pratica-rapida-logo.png`

## Dettagli tecnici

| File | Modifica |
|------|----------|
| `public/pratica-rapida-logo.png` | Nuovo file: logo caricato dall'utente |
| `src/pages/Auth.tsx` | Cambiare `src="/impresa-logo.png"` in `src="/pratica-rapida-logo.png"` |
| `src/components/AppSidebar.tsx` | Cambiare entrambi i riferimenti a `/impresa-logo.png` in `/pratica-rapida-logo.png` |

Nessuna modifica al database o alla logica applicativa.

