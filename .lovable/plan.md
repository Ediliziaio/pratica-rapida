

# Fix Barra in Basso su Mobile

## Problema
Su mobile il testo "Iscriviti alla Piattaforma e Ricevi in Regalo il Documento:" e' troppo lungo e non comunica chiaramente cosa si riceve.

## Soluzione
Su mobile mostrare un testo breve e diretto, su desktop mantenere il testo completo.

### Modifica alla riga 1117-1119 di `src/pages/Home.tsx`:

**Mobile:** "Iscriviti Gratis e Ricevi la Guida: Come Trasformare un Preventivo in una Vendita"
**Desktop:** Testo attuale invariato (3 righe complete)

Implementazione con classi `hidden/block md:hidden/md:block`:

```text
<!-- Mobile: testo compatto -->
<p className="block md:hidden text-white text-xs font-semibold">
  Iscriviti e Ricevi Gratis la Guida:
  <span style={{ color: PR_GREEN }}> "Come Trasformare un Preventivo in una Vendita"</span>
</p>

<!-- Desktop: testo completo (invariato) -->
<div className="hidden md:block">
  <p>Iscriviti alla Piattaforma e Ricevi in Regalo il Documento:</p>
  <p>"Come Trasformare un Preventivo in una Vendita..."</p>
  <p>Il Metodo per Far Dire "Si"...</p>
</div>
```

### File modificato

| File | Modifica |
|------|----------|
| `src/pages/Home.tsx` | Righe 1116-1125: testo mobile compatto con titolo guida visibile, testo desktop invariato |

