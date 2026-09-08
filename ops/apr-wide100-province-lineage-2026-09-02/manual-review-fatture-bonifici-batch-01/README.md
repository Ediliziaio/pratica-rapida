# Lotto manuale 01 - fatture e riconciliazione

Raccolta read-only eseguita il 2026-09-02 con l'account auditor Supabase sulla vista `enea_practices_public` e sul bucket `enea-documents`.

- Campione: 8 pratiche scelte tra i 17 casi fatture/riconciliazione del wide100.
- Criterio: casi con pochi documenti o anomalia economica semplice da verificare visivamente.
- Nessuna scrittura o modifica al CRM o al bucket.
- I file al livello principale di ogni pratica sono le copie utili alla revisione economica.
- `origine-crm/` conserva tutte le referenze scaricate dal CRM, comprese copie identiche e allegati non economici, per rendere verificabile la selezione.

## Casi

1. `01-giovanna-atzeni` - pratica `dc4484cd-c462-49c0-a734-3064dd6469a8`, coorte 2943.
   - File utile: `fattura1.pdf` (€3.950,00).
   - Il CRM espone tre percorsi distinti, ma i tre download sono byte-per-byte identici (SHA-256 `f79d014ab2f69c6334788059658a4e483a19f0711a5e8bfcbab9a0088f064559`). Non è esposto un bonifico distinto nel corpus corrente, nonostante il blocker del test menzioni un capitale bonificato di €3.950,90.
2. `02-elena-marcella-berti` - pratica `4e251174-6b43-4c76-98ff-6f00c1caede9`, coorte 2992.
   - File utile: `bonifici1-2_e_fatture1-2.pdf`.
   - PDF originale composito di quattro pagine: due bonifici da €660,00 e due fatture da €660,00.
3. `03-gabriele-girelli` - pratica `b35fc3d3-d441-48d0-99f0-1d1e967ab6e7`, coorte 2938.
   - File utile: `documento-classificato-fattura_non-fiscale.png`.
   - L'unico allegato nel gruppo fatture è un'immagine del logo PraticaRapida, non un documento fiscale.
4. `04-giovanni-amadu` - pratica `e94df373-f8f5-44b9-bd31-3e6c36025c13`, coorte 2999.
   - File utile: `fattura1.pdf`.
   - Tre percorsi CRM producono lo stesso PDF (SHA-256 `089d9e324bfaebd24aeec9edd57a640d463986a4f4b3e4239d6502e50de87d10`).
5. `05-francesca-pisanu` - pratica `2329836b-3d7c-4e55-b5ba-f232515a2299`, coorte 2995.
   - File utile: `fattura1.pdf`.
   - Tre percorsi CRM producono lo stesso PDF (SHA-256 `e0e8cfc8a249ca6150b5c430c7205af82133941c2d12292f7efede6c5456e463`).
6. `06-maurizia-coreggioli` - pratica `81b4934a-3d6a-49ff-8f08-8d1400d55dff`, coorte 2990.
   - File utili: `fattura1.pdf` (99/2026) e `fattura2.pdf` (434/2025).
7. `07-massimo-cappello` - pratica `0a92f92c-22ed-4a43-b47e-6abe1d74282a`, coorte 2970.
   - File utili: `fattura1.pdf` (88/2026) e `fattura2.pdf` (81/2026).
   - Il terzo allegato del gruppo fatture è in realtà una dichiarazione tecnica Internorm ed è conservato soltanto in `origine-crm/`.
8. `08-claudia-sellati` - pratica `58f03680-c716-42e7-ad7d-e3ceaee5573d`, coorte 2988.
   - File utili: `fattura1.pdf` (44/2026) e `fattura2.pdf` (129/2026).
   - Gli altri allegati del gruppo fatture sono documenti di identità, visura e ordine; gli aggiuntivi sono schede tecniche/modulo. Sono conservati in `origine-crm/`.

## Riscontri usati

1. Fonte persistente APR: checkpoint `blocked_case`, `report.blockers` economici e snapshot dashboard `OPERATOR_REQUIRED` delle coorti indicate.
2. Fonte CRM auditor: righe correnti della vista `enea_practices_public` e relativi percorsi storage.
3. Fonte documento: download autenticato read-only, tipo file, SHA-256 e ispezione visiva delle pagine renderizzate.

