# EneaSubito — come si governa la crescita

> Deciso dal Titolare il 12 ottobre 2026.
> **Obiettivo: tre pratiche al giorno.** **Tetto: 20 € di pubblicità per pratica.**

Questo documento è il manuale d'uso. Dice dove si guarda, ogni quanto, e cosa
si fa dei numeri che si leggono. Chi lo apre fra sei mesi deve poter riprendere
in mano la cosa senza chiedere niente a nessuno.

---

## 1. Dove si guarda

Nel CRM, voce **EneaSubito** nel menu a sinistra (solo super admin), oppure
direttamente `/eneasubito/acquisizione`.

La pagina mostra, mese per mese:

| Riquadro | Cosa dice | Quando è un problema |
|---|---|---|
| Pratiche vendute | Quante sono state **pagate** finora | Meno di quelle attese a oggi |
| Media al giorno | Il passo realizzato | Sotto 3,0 |
| Costo per pratica | Spesa ÷ pratiche **pagate** | Sopra 20 € |
| Arrivati · hanno pagato | Quanti hanno aperto il modulo e quanti sono arrivati in fondo | Sotto 30 su 100 |

Sotto c'è la tabella **da dove arrivano**: una riga per gruppo, con quanti sono
arrivati, quanti hanno pagato, i loro nomi, l'incassato, la spesa che hai
dichiarato e il costo per pratica venduta.

**Chi apre il modulo e non paga non è un cliente.** L'obiettivo dei tre al
giorno conta le *vendite*, e il costo per pratica si divide per quelle: pagare
per far aprire dei moduli non è un risultato. I due numeri stanno comunque
affiancati, perché la loro differenza dice un'altra cosa importante — quanta
gente si perde alla cassa. Se arrivano in tanti e paga meno di uno su tre, il
problema non è la pubblicità: è il sito.

**Il conteggio è sulla data di creazione della pratica, non su quella di
incasso.** Qui si misura l'acquisizione: quante persone sono arrivate. Il
fatturato si guarda nel riepilogo del Kanban, che conta per data di incasso: è
normale che i due numeri non coincidano, e non è un errore.

---

## 2. Il numero che devi inserire tu

La pubblicità la paghi a Google e a chiunque altro: quei sistemi non parlano
con il nostro database, e **non c'è nessun modo di saperlo da soli**. Ogni
riga della tabella ha una casella: ci scrivi quanto hai speso in quel gruppo,
in quel mese, e salvi.

**Dove non lo scrivi, il costo per pratica resta vuoto.** Non viene stimato di
proposito: su quella cifra decidi dove mettere i soldi, e un numero inventato
ti farebbe decidere male.

Si aggiorna **una volta a settimana**, il lunedì, leggendo la spesa dei sette
giorni dai pannelli di Google Ads. Non serve di più.

---

## 3. Come si marcano le campagne

Perché i numeri siano leggibili, ogni collegamento verso il sito deve portare
le etichette giuste. Senza, tutto finisce in «Diretto» e la tabella non serve
a niente.

La forma è sempre questa:

```
https://www.eneasubito.it/verifica?utm_source=SORGENTE&utm_medium=MEZZO&utm_campaign=CAMPAGNA
```

**Le parole da usare, e solo queste:**

| Pezzo | Valori ammessi | Cosa significa |
|---|---|---|
| `utm_source` | `google`, `chatgpt`, `bing`, `newsletter`, `caf` | Chi ti ha mandato la persona |
| `utm_medium` | `cpc` (a pagamento), `organico`, `email`, `passaparola` | Se quel clic è costato o no |
| `utm_campaign` | `infissi-90giorni`, `schermature-generica`, … | Quale iniziativa |
| `utm_term` | la parola cercata | Su Google lo riempie lui con `{keyword}` |
| `utm_content` | `annuncio-a`, `annuncio-b` | Quale variante dell'annuncio |

**Regola che non si cambia:** `utm_medium=cpc` significa *ho pagato per questo
clic*. È l'unica cosa che fa finire quella pratica fra i costi. Se la scrivi
diversa, quella spesa sparisce dai conti.

Su Google Ads non serve fare niente a mano: basta lasciare attivo il
**tagging automatico** (`gclid`), che il sito riconosce da solo e conta come
clic pagato anche senza etichette.

---

## 4. Cosa si registra, e cosa no

Si registra, attaccato alla pratica, al momento in cui nasce:

- le etichette della campagna (`utm_*`) e l'identificativo del clic di Google;
- **il solo nome** del sito di partenza (`google.com`), mai l'indirizzo
  completo — quello contiene la ricerca che la persona ha digitato;
- la pagina su cui è atterrata e l'ora.

**Vince il primo tocco.** Chi arriva da un annuncio, se ne va e torna il
giorno dopo digitando il nome del sito, l'ha portato l'annuncio. La
provenienza si prende all'ingresso e non si sovrascrive più.

Non si usano cookie, non si contattano servizi esterni, non si profila
nessuno. Il dato vive nella scheda del browser per la durata della visita e
poi sulla pratica. È scritto nella pagina privacy e in quella sui cookie.

**Le pratiche marcate «Non so da dove arriva»** sono quelle nate prima di
questo meccanismo, o di chi ha ricaricato la pagina a metà strada. Qualcuna
è fisiologica. **Se diventano la maggioranza, qualcosa si è rotto**: è il
primo segnale da guardare.

---

## 5. Le decisioni, con le soglie

Si guarda il **lunedì mattina**, dieci minuti. Tre regole, in quest'ordine.

**a) Un gruppo sopra i 20 € a pratica venduta.**
Non si spegne subito: prima si guarda se il problema è il costo del clic o la
percentuale di chi paga. Se in due settimane non rientra, si spegne.

**b) Un gruppo su cui si è speso e da cui non è entrata nessuna vendita.**
Compare in tabella con zero pagate — anche se qualcuno è arrivato. Dopo **30 €
spesi a vuoto** si spegne, senza discutere: non è un investimento, è una
perdita.

**b-bis) Arrivano in tanti e paga meno di uno su tre.**
Qui non si tocca la pubblicità, perché sta funzionando: si guarda il sito. O il
modulo perde pezzi, o la pagina promette una cosa diversa da quella che trovano
alla cassa.

**c) Un gruppo sotto i 10 € a pratica.**
È il caso buono e va sfruttato: si alza il budget del 50% e si riguarda la
settimana dopo. Si continua finché il costo resta sotto i 20 €.

**Non si cambiano due cose nella stessa settimana.** Se alzi un budget e
contemporaneamente riscrivi un annuncio, la settimana dopo non sai quale delle
due ha funzionato. Una alla volta, e si misura.

---

## 6. I passaggi previsti, in ordine

Lo stato di oggi e cosa viene dopo.

- [x] **Registrare da dove arrivano** — fatto il 13 ottobre 2026. È il
      presupposto di tutto il resto: senza, il tetto dei 20 € non è
      applicabile.
- [ ] **Misurare la domanda vera.** Dentro Google Ads, *Strumento di
      pianificazione delle parole chiave*: quante ricerche al mese ci sono in
      Italia per `pratica enea infissi`, `comunicazione enea 90 giorni`,
      `enea scaduta cosa fare`, `come inviare comunicazione enea`. È gratis e
      sostituisce una stima con un fatto. **Da fare prima di spendere.**
- [ ] **Accendere Google Ads**, 15 €/giorno, solo su quelle ricerche. Non su
      «ecobonus» o «detrazioni»: costano care e portano curiosi.
- [ ] **Scrivere le quattro pagine** che rispondono alle domande di chi è nel
      panico: *ho superato i 90 giorni*, *serve lo SPID?*, *ho perso il codice
      CPID*, *la pratica la può fare il mio installatore?*. Costano solo tempo
      e non si spengono quando smetti di pagare.
- [ ] **Parlare con i CAF e i commercialisti.** A loro arriva gente che ha
      cambiato gli infissi, e molti la pratica ENEA non la fanno. Non è in
      conflitto con Pratica Rapida, che vende agli installatori.
- [ ] **ChatGPT**, 5 €/giorno, solo dopo che Google ha dei numeri.

**Cosa non si fa**, e il motivo:

- **Facebook e Instagram per acquisire.** Il cliente non si riconosce per età
  o interessi, si riconosce per *quando* ha finito i lavori, e Meta quello non
  lo sa. Semmai serve dopo, per ripescare chi è passato e non ha pagato.
- **Gli installatori.** Sono i clienti di Pratica Rapida. Se vedono EneaSubito
  parlare ai loro clienti a 99 €, il danno è sull'altro marchio.
- **Il secondo pulsante «paga a rate» in home.** Su 99 € le rate non vendono,
  e dicono al cliente che la cifra è impegnativa — il contrario di quello che
  dice tutto il resto del sito.

---

## 7. Quanto può bastare

Chi cerca «pratica enea» è il cliente perfetto ma non è tantissima gente. Con
una stima prudente — tremila ricerche al mese sulle parole giuste, un quarto
dei clic, uno su dieci che paga — vengono fuori **60-90 pratiche al mese**:
l'obiettivo è raggiungibile, ma **solo prendendosi quasi tutta quella
domanda**, a pagamento e gratis.

Tradotto: la pubblicità su Google da sola porta probabilmente **una o due
pratiche al giorno**. La terza arriva dalle pagine scritte e dal passaparola
dei CAF, e quei due canali ci mettono mesi a entrare a regime.

I conti del tetto reggono: 90 pratiche × 20 € = 1.800 € di spesa contro circa
8.900 € di incasso.

Per riferimento, la dimensione del mercato: nell'ultimo anno con dati completi
le comunicazioni all'ENEA sono state **627.933 per l'Ecobonus** e **634.666
per il Bonus Casa**. Tre al giorno sono 1.080 l'anno, **lo 0,1%**. Il problema
non è quanto è grande il mercato: è che quasi nessuna di quelle persone ti
cerca, perché la pratica gliela fa l'installatore o il CAF, o non la fanno.

---

## 8. Dove sta scritto cosa

| File | Cosa fa |
|---|---|
| `src/pages/eneasubito/provenienza.ts` | Prende la provenienza all'ingresso del sito |
| `src/lib/eneasubito-provenienza.ts` | La traduce in gruppi leggibili e li conta |
| `src/lib/eneasubito-acquisizione.ts` | Obiettivi, passo del mese, costo per pratica |
| `src/pages/EneaSubitoAcquisizione.tsx` | La pagina del CRM |
| `supabase/functions/eneasubito-verifica/index.ts` | Ripulisce e salva la provenienza |
| `supabase/migrations/20261013020000_provenienza.sql` | La colonna e la sua esposizione |

**La traduzione in etichette sta in un posto solo**, e non dentro la pratica
salvata: il giorno in cui si aggiunge un canale nuovo basta aggiungere una
regola lì e **anche le pratiche di sei mesi fa vengono rilette bene**. Se
l'etichetta fosse stata scritta dentro la pratica, resterebbe sbagliata per
sempre.
