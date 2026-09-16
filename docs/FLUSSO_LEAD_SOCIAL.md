# Flusso lead social — stato e progetto

**Stato:** audit iniziale in sola lettura completato il 16 settembre 2026  
**Vincolo:** la campagna già gestita da Samuele non viene modificata; nessuna nuova campagna o aumento di budget finché acquisizione, notifica, assegnazione e misurazione non sono collaudate  
**Responsabile:** Cabina di Regia PraticaRapida

## Stato rilevato

### Meta

- la pagina dispone del **Centro per clienti potenziali**;
- è presente 1 contatto acquisito da origine organica;
- la pipeline Meta mostra le fasi Acquisiti, Qualificati e Convertiti;
- il Titolare segnala una campagna già attiva e gestita da Samuele, esterna al perimetro della gestione organica;
- il riepilogo semplificato della pagina mostra “Crea la tua prima inserzione”, ma rimanda al conto pubblicitario `483495670677844`: lo stato effettivo della campagna e la sua destinazione lead devono essere verificati nel conto usato da Samuele;
- non è ancora provata un'integrazione automatica tra i moduli Meta e il CRM PraticaRapida;
- Instagram non è ancora collegato alla pagina in Meta Business Suite.

### Sito e piattaforma PraticaRapida

- le landing pubbliche usano il componente `LeadRequestModal`;
- il modulo salva i dati nella tabella Supabase `public.leads` con origine `public_form` e URL della pagina;
- i contatti sono visibili al personale nella pagina interna `/aziende`, sezione Pipeline;
- i nuovi lead web non contattati generano un badge nel menu Aziende;
- la pipeline consente passaggio di fase, modifica, archiviazione e marcatura come contattato.

## Problema da risolvere

Oggi esistono almeno due contenitori distinti:

1. **Meta Lead Center** per messaggi e moduli Facebook/Instagram;
2. **CRM PraticaRapida** per i moduli delle landing del sito.

Senza integrazione, un lead Meta può restare separato dal flusso operativo interno. La campagna esistente resta sotto la responsabilità di Samuele e non viene toccata; prima di nuove campagne o aumenti di budget va verificato il suo percorso di acquisizione.

## Flusso obiettivo

`Post o inserzione → modulo unico → CRM PraticaRapida → notifica → assegnazione → contatto → esito → report`.

Campi minimi da normalizzare:

- nome e cognome;
- azienda e ruolo;
- email e telefono;
- categoria di interesse: infissi, schermature solari, pompe di calore, insufflaggio, professionista;
- provincia;
- origine, campagna, contenuto e data;
- consenso privacy;
- responsabile e stato del contatto.

## Collaudo obbligatorio prima del budget

1. scegliere il CRM PraticaRapida come archivio unico;
2. collegare o importare automaticamente i lead Meta;
3. creare notifiche immediate e un responsabile predefinito;
4. inviare un lead di prova da ogni canale;
5. verificare arrivo, campi, consenso, notifica e presa in carico;
6. misurare tempo di risposta e conversione;
7. ricostruire insieme a Samuele il form e la destinazione della campagna già attiva;
8. solo dopo il collaudo, definire eventuali nuovi budget e campagne.

## Indicatori

- lead ricevuti per canale;
- percentuale con dati completi;
- tempo medio alla prima risposta;
- lead qualificati;
- appuntamenti o demo;
- clienti acquisiti;
- costo per lead e costo per cliente, solo quando partiranno le campagne.
