

# Home Page "Pratica Rapida" - Landing Page

Creare una nuova pagina `/home` pubblica (accessibile senza login) che replica la struttura grafica del sito di riferimento (progressbuild-cloud.lovable.app/home) ma con i testi del PDF di Pratica Rapida.

## Struttura della pagina

La pagina seguira' l'esatto layout del sito di riferimento con sfondo scuro, sezioni alternate e stile moderno:

### 1. Top Banner
Barra verde in alto: "ZERO VINCOLI. PAGHI SOLO A PRATICA COMPLETATA."

### 2. Navbar
Logo Pratica Rapida a sinistra, link navigazione (Come Funziona, Vantaggi, Prezzi, Accedi), bottone CTA "Attiva Ora"

### 3. Hero Section
- Badge: "PER AZIENDE DI INFISSI, TENDE, PERGOLE E SERRAMENTI"
- Titolo grande: "Quante Vendite Stai Perdendo Perche' Non Gestisci le Pratiche ENEA?" con parte evidenziata in verde
- Mockup dashboard sotto (come nel riferimento, ma con dati pratiche ENEA)
- Sottotitolo descrittivo dal PDF
- Due bottoni CTA: "Attiva Pratica Rapida" + "Scopri Come Funziona"
- Stats: "65 euro/pratica" | "24h Consegna" | "Supporto Italiano"

### 4. Sezione "Il Problema"
- Titolo: "Sai qual e' il modo piu' veloce per perdere un cliente nel 2025?"
- Testo dal PDF con evidenziazioni
- Icone per le due "trappole" (Low Cost vs Software Premium)

### 5. Sezione "Come Funziona" (3 step)
Card numerate con icone:
1. Inserisci il numero di telefono del cliente
2. Noi contattiamo il cliente a nome tuo
3. In 24 ore la pratica e' pronta

### 6. Confronto tabellare
Tabella "Quello che hai adesso" vs "Pratica Rapida" (dal PDF)

### 7. Sezione Prezzo
- "65 euro a pratica completata — tutto incluso, nessun canone"
- Lista vantaggi inclusi
- Lista cose che NON devi piu' fare

### 8. Sezione Garanzie (2 card)
- Garanzia #1: Assicurazione Blindata
- Garanzia #2: Paghi Solo a Pratica Effettuata

### 9. Sezione "Chi c'e' dietro"
Testo dal PDF sulla storia dell'azienda

### 10. CTA Finale
- "Smetti di Perdere Vendite"
- Bottone grande "Attiva Pratica Rapida Ora"
- P.S. dal PDF

### 11. Footer
Link navigazione, copyright, contatti

## Dettagli tecnici

| File | Azione |
|------|--------|
| `src/pages/Home.tsx` | **Nuovo** - Landing page completa con tutte le sezioni |
| `src/App.tsx` | Aggiungere route `/home` pubblica (senza ProtectedRoute) |
| `src/index.css` | Aggiungere variabili CSS per il tema scuro della landing e animazioni |

### Stile grafico (replica del riferimento)
- Sfondo scuro (`#0a1628` / `#0f1d32`) come il sito di riferimento
- Accento verde/teal (`#10b981`) per CTA e highlight
- Testo bianco su sfondo scuro
- Card con bordi sottili e sfondo semitrasparente
- Animazioni di entrata per le sezioni (fade-in)
- Mockup dashboard con card KPI stilizzate
- Layout responsive mobile-first
- Font Inter (gia' caricato nel progetto)
- Gradiente sottile sullo sfondo hero
- Icone flottanti decorative sui lati (come nel riferimento)

### Routing
- `/home` sara' una route pubblica, accessibile senza autenticazione
- La route `/auth` restera' per il login
- Il bottone "Accedi" nella navbar portera' a `/auth`

