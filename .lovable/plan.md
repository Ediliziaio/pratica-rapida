
# Barra Fissa in Alto + Barra Fissa in Basso

## 1. Barra fissa in alto (Top Bar)

Sostituzione del banner attuale (riga 196-199) con il nuovo messaggio:

**Testo:** "Paghi Solo a Pratica Effettuata"
- Sfondo verde `PR_GREEN`, testo bianco, font semibold
- Icona `Gift` mantenuta
- Resta fisso in cima alla pagina (non nella navbar, ma sopra)

## 2. Barra fissa in basso (Bottom Bar / Sticky Footer CTA)

Aggiunta di una barra fissa (`fixed bottom-0`) sempre visibile con:

**Titolo:** "Iscriviti alla Piattaforma e Ricevi in Regalo il Documento:"
**Sottotitolo:** "Come Trasformare un Preventivo in una Vendita (Senza Rincorrere il Cliente)"
**Sotto-sottotitolo:** "Il Metodo per Far Dire 'Si' al Cliente Senza Pressioni, Telefonate Inutili o Sconti Forzati"

- Sfondo scuro (`bg-[#0a1628]`) o verde `PR_GREEN` con bordo top `border-t`
- Bottone CTA "Iscriviti Gratis" che linka a `/auth`
- Su mobile: testo piu' compatto, bottone full-width
- `z-50` per restare sopra tutto il contenuto
- Padding bottom aggiunto al body/container per evitare che la barra copra il footer

## Dettaglio tecnico

### Top bar (riga 196-199):
Modifica del testo esistente da "ZERO VINCOLI. PAGHI SOLO A PRATICA COMPLETATA." a **"PAGHI SOLO A PRATICA EFFETTUATA"**

### Bottom bar (prima della chiusura del div principale, riga 1112):
```text
<div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0a1628] border-t border-white/10 shadow-2xl">
  <div className="max-w-5xl mx-auto px-4 py-3 md:py-4 flex flex-col md:flex-row items-center justify-between gap-3">
    <div className="text-center md:text-left">
      <p className="text-white text-sm md:text-base font-semibold">
        Iscriviti alla Piattaforma e Ricevi in Regalo il Documento:
      </p>
      <p className="text-xs md:text-sm font-bold" style={{ color: PR_GREEN }}>
        "Come Trasformare un Preventivo in una Vendita (Senza Rincorrere il Cliente)"
      </p>
      <p className="text-[10px] md:text-xs text-white/40">
        Il Metodo per Far Dire "Si" al Cliente Senza Pressioni, Telefonate Inutili o Sconti Forzati
      </p>
    </div>
    <Link to="/auth" className="...CTA button styles...">
      Iscriviti Gratis
    </Link>
  </div>
</div>
```

- Aggiunta di `pb-28` al container principale per compensare l'altezza della barra fissa e non coprire il footer

### File modificato

| File | Modifica |
|------|----------|
| `src/pages/Home.tsx` | 1) Riga 196-199: cambio testo top banner. 2) Prima di riga 1112: aggiunta barra fissa in basso con CTA e testo documento regalo. 3) Riga 192: aggiunta `pb-28` al container |
