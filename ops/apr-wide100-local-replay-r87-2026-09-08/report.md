# Replay locale wide100 — r87 (post-ricostruzione completa mai selettiva, stato persistito, hash-verificato)

- Data replay: 2026-09-08T09:13:45.125Z
- Bundle installato: 15355efa-bank-transfer-triple-fix-r87-2026-09-08-20260908
- Manifest: ops/apr-wide100-province-lineage-2026-09-02/manifest.json (sha256 51842252f71cabb6714f78923fe59ec9789ad06739393f61a553bb4bdb9154e0)
- Artifact ID (firma): e77c15884b547476cfc2ca35262b27ed8080aa1bbdbb0cebf14dbad2d6c24ff9
- Fonte: stato persistito nei checkpoint dopo la ricostruzione forzata e mai selettiva di TUTTE le 100 pratiche (full-reconstruction-r87.mjs); ogni pratica verificata portare la revisione apr-full-reconstruction-r87-2026-09-08 tra quelle applicate, prova che non e' un verdetto vecchio mai ricalcolato.
- Correzione inclusa in questo giro: un segmento fattura con conferma di bonifico accodata nello stesso allegato viene escluso dal calcolo economico soltanto se la sua terna fiscale (numero, data, totale) non si risolve gia' dal testo che precede l'intestazione bancaria (regressione Ronconi, corretta alla radice l'8/9/2026).

## Risultato

- Pratiche totali: 100
- **Procedibili (ready_local_plan): 48**
- Bloccate: 52
- Non trovate: 0
- Errori: 0
- Non genuinamente ricostruite (deve essere 0): 0

## Frequenza blocker (tra le pratiche bloccate)

- screenings_missing: 21
- gross_triple_reconciliation_failed: 16
- product_cardinality_form_invoice_mismatch: 16
- completion_date_portal_year_mismatch: 11
- completion_over_90_days_operator_required: 11
- original_invoice_missing_or_unavailable: 9
- invoice_332a5af9: 9
- completion_date_missing: 8
- screening_primary_measurements_missing: 7
- customer_form_missing: 7
- tax_code_missing_or_invalid: 6
- draft_payload_mapping_incomplete: 5
- invoice_929a8665: 4
- permanent_supplier_automation_exclusion: 3
- permanent_customer_automation_exclusion: 2
- works_municipality_invoice_conflict: 1
- persiana_measurement_ambiguous_1: 1
- co_beneficiary_invoice_identity_unresolved: 1

## Pratiche procedibili

- lucia-droghetti (LUCIA DROGHETTI, screening)
- angela-tuttolani (Angela Tuttolani, screening)
- marcella-capatti (Marcella Capatti, infissi)
- matteo-capitanelli (MATTEO CAPITANELLI, infissi)
- eugenio-codognato (EUGENIO CODOGNATO, infissi)
- gregorio-fusco (gregorio fusco, infissi)
- luca-ronconi (Luca Ronconi, screening)
- andrea-trabucco (Andrea Trabucco, infissi)
- antonella-ferletic (Antonella Ferletic, screening)
- luca-cigognetti (Luca Cigognetti, infissi)
- lia-chiericati (Lia Chiericati, screening)
- della-maria-carla-vigetti (Della Maria Carla Vigetti, screening)
- gabriello-manso (GABRIELLO MANSO, screening)
- monica-molteni (Monica Molteni, screening)
- claudia-campagna (Claudia Campagna, screening)
- fabio-sartori (Fabio Sartori, screening)
- annalisa-lanzo (ANNALISA LANZO, screening)
- armando-ranzoni (Armando Ranzoni, infissi)
- monica-ambra-fioravanti (MONICA AMBRA FIORAVANTI, screening)
- adelfio-pietro-spinelli (Adelfio Pietro Spinelli, screening)
- cesare-imperiali (Cesare Imperiali, infissi)
- lea-dettori (Lea Dettori, screening)
- massimo-cappello (massimo cappello, infissi)
- stefano-buosi (Stefano Buosi, infissi)
- fares-hassairi (Fares Hassairi, screening)
- ivana-mastrangelo (Ivana Mastrangelo, infissi)
- lucia-lagrasta (Lucia Lagrasta, screening)
- angelina-stricelli (Angelina Stricelli, infissi)
- nadia-ragni (Nadia Ragni, screening)
- milena-albertoni (Milena Albertoni, screening)
- cataldo-cassone (Cataldo Cassone, screening)
- romeo-ropa (Romeo Ropa, screening)
- claudia-sellati (CLAUDIA SELLATI, infissi)
- milena-fiorini (Milena Fiorini, screening)
- elena-depalma (ELENA DEPALMA, infissi)
- mauro-ballabio (Mauro Ballabio, screening)
- flavia-cipriani (Flavia Cipriani, infissi)
- rosa-toscano (rosa toscano, screening)
- claudio-beghini (Claudio Beghini, screening)
- luigi-carfora (Luigi Carfora, screening)
- zeno-righetti (Zeno Righetti, screening)
- gianluigi-chiolini (Gianluigi Chiolini, screening)
- francesco-laurelli (FRANCESCO LAURELLI, screening)
- fausta-de-filippo (Fausta De Filippo, screening)
- danila-serpa (Danila Serpa, screening)
- antonio-scaparrotta (Antonio Scaparrotta, infissi)
- fabrizio-pelizzari (Fabrizio Pelizzari, screening)
- mimosa-freni (Mimosa Freni, screening)
