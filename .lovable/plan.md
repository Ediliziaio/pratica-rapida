

# Rebranding e Semplificazione: da "Impresa Leggera" a "Pratica Rapida"

## Obiettivo
Rinominare il brand in **Pratica Rapida** e semplificare la piattaforma per gestire esclusivamente **Pratiche ENEA**. Il flusso e':
1. Il **Super Admin** crea le aziende e puo' accedere alla loro area
2. Le **aziende** accedono, inseriscono i dati del cliente e inviano la pratica ENEA
3. **Pratica Rapida** riceve la notifica e lavora la pratica attraverso le varie fasi
4. L'**azienda** vede la pratica ENEA completata nel portale

---

## Cosa cambia

### 1. Rebranding testi e immagini
- Sostituire tutti i riferimenti "Impresa Leggera" con "Pratica Rapida" in:
  - `Auth.tsx` (titolo, alt immagini, tagline, disclaimer)
  - `AppSidebar.tsx` (alt immagini)
  - `DisclaimerBanner.tsx` (testo disclaimer adattato a Pratica ENEA)
  - `Wallet.tsx` (testo contatto admin)
  - `index.html` (title e meta tag)
- Aggiornare il logo: rinominare/sostituire `public/impresa-logo.png` oppure puntare a un nuovo file logo
- Aggiornare la tagline da "Meno burocrazia, piu' business" a qualcosa come "La tua Pratica ENEA, semplice e veloce"

### 2. Semplificazione navigazione (sidebar)
Rimuovere le voci non necessarie per un servizio solo ENEA:
- **Area Azienda**: mantenere solo Dashboard, Nuova Pratica ENEA, Pratiche, Wallet
- Rimuovere **Clienti** come pagina separata (i dati cliente vengono raccolti dentro il flusso della pratica)
- Rimuovere **Fatturazione** dalla sidebar (non serve per ora)
- **Area Interna**: mantenere Dashboard, Coda Pratiche, Aziende
- **Super Admin**: mantenere Utenti e Ruoli (rimuovere Listino Servizi e Analytics per ora)

### 3. Semplificazione flusso "Nuova Pratica"
Invece del wizard generico multi-categoria, creare un flusso dedicato alla **Pratica ENEA**:
- Rimuovere lo step di selezione servizio/categoria (e' sempre ENEA)
- Step 1: **Dati Cliente** - nome, cognome, codice fiscale, indirizzo dell'immobile, email, telefono
- Step 2: **Dati Pratica ENEA** - tipo intervento, dati catastali, data fine lavori, importo lavori
- Step 3: **Riepilogo e Invio**
- La pratica viene creata automaticamente con categoria `enea_bonus` e il servizio ENEA dal catalogo

### 4. Semplificazione pagine esistenti
- **Pratiche.tsx**: rimuovere i filtri per categoria (c'e' solo ENEA), mantenere filtro per stato
- **PraticaDetail.tsx**: rimuovere riferimenti a categorie multiple, mostrare i dati specifici ENEA
- **Dashboard.tsx**: semplificare KPI, rimuovere breakdown per categoria
- **CodaPratiche.tsx**: rimuovere filtro categoria

### 5. Rimozione route non necessarie
Rimuovere da `App.tsx` le route:
- `/clienti` (integrato nel flusso pratica)
- `/fatturazione`, `/fatturazione/nuova`, `/fatturazione/:id`
- `/listino`
- `/analytics`

---

## Dettagli tecnici

### File da modificare
| File | Modifiche |
|------|-----------|
| `index.html` | Title e meta tag -> "Pratica Rapida" |
| `src/pages/Auth.tsx` | Brand name, tagline, disclaimer |
| `src/components/AppSidebar.tsx` | Voci menu semplificate, alt logo |
| `src/components/AppLayout.tsx` | Nessuna modifica strutturale |
| `src/components/DisclaimerBanner.tsx` | Testo aggiornato per Pratica ENEA |
| `src/pages/NuovaPratica.tsx` | Flusso dedicato ENEA (dati cliente + dati pratica) |
| `src/pages/Pratiche.tsx` | Rimuovere filtro categoria |
| `src/pages/PraticaDetail.tsx` | Rimuovere category labels, mostrare dati ENEA |
| `src/pages/Dashboard.tsx` | Semplificare KPI, rimuovere breakdown categoria |
| `src/pages/CodaPratiche.tsx` | Rimuovere filtro categoria |
| `src/pages/Wallet.tsx` | Aggiornare testo brand |
| `src/App.tsx` | Rimuovere route non usate |

### Database
- Nessuna modifica allo schema richiesta: il campo `dati_pratica` (jsonb) nella tabella `pratiche` puo' gia' contenere i dati specifici ENEA (tipo intervento, dati catastali, ecc.)
- La categoria `enea_bonus` esiste gia' nell'enum `service_category`
- I dati del cliente vengono salvati in `clienti_finali` come gia' previsto

### File da NON toccare
- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/types.ts`
- `.env`
- `supabase/config.toml`

