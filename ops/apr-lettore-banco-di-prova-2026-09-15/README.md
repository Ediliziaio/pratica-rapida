# Banco di prova del lettore generale — fatture reali, lotto apr-wide148-r126-20260915

Solo lettura: i testi stanno in `cohorts/apr-pilot-<coorte>-global-controller-*/crm-document-analysis/text/`.
Nessuna di queste forme e' letta dal parser attuale (product_cardinality_form_invoice_mismatch
o screening_primary_measurements_missing nel giro del 15/09).

## Righe prodotto / misure presenti nel testo e non lette (verificato 15/09 16:30)

| Coorte | Cliente | Fornitore | Forma stampata |
|---|---|---|---|
| 10015 | Lisca | Brianza Serramenti (Milano Veneziane) | `VENEZIANE DUPLEX 7 1 640 X 1000 CAMERADX ... 1 712 X 750 ...` (mm, una riga per pezzo) |
| 10039 | Cattaneo | Brianza Serramenti (Milano Veneziane) | `VENEZIANE VILLA 8 1 781 X 1110 CAMERASX ...` (mm) + `Larghezza=300; Sporgenza=300` |
| 10023 | Musci | (P.IVA 09590360153) | `N. 1 TENDA DA CM 310 X 220, COMPLETA DI TESSUTO` |
| 10047 | Andres | (P.IVA 09590360153) | `N. 2 DA CM. 317 X 220, COMPLETE DI TESSUTO E ACCESSORI SU MISURA` |
| 10041 | Rizza | LM Tende | `N° 1 da 225 x 160 cm (manovra a SX V.I.)` ... `Schermatura superficie mq 3,60` |
| 10046 | Carriero | ODHAUS | `TENDA A RULLO ... LARGHEZZA 6420X1945 NR 1,00` |
| 10018 | Scaccabarozzi | Brianza Serramenti | tabella con intestazioni `SPORGENZA Modello Larghezza Comandi` — valori in colonna, da guardare sul PDF |
| 10014 | Agostinelli | Ikona | `tende crista complete di timpani laterali` (da guardare) |

## Domanda vera (misure assenti in tutti i documenti)
| 10002 | Candito | pergola | tre fatture, nessuna misura stampata |

## Fornitori mai visti nelle 83 (per la misura «zero righe sbagliate»)
Rotondi Infissi (Iodice, salvata), 2 Erre Tende (Bonoli), Sima Home (Costigliolo), P.IVA 01493070112 (Agostinelli), P.IVA 09590360153 (Musci, Andres).

## Aggiunte 17/09/2026 — errori di lettura su fornitori NOTI (giro ombra delle 11:40)

Il titolare li considera gravi: forme che dovevano essere superate.

| Coorte | Cliente | Fornitore | Cosa e' successo | Cosa c'e' scritto |
|---|---|---|---|---|
| marco-zambella | Zambella | Rinaldi (13 pratiche note) | contate 1 tenda, il form ne dice 2 → domanda inutile | fattura: `STORBOX-300 ... TENDA A BRACCI ESTENSIBILI ... SUPERFICIE SCHERMATURA 6,2 mq` **e** `V0 TENDA A CADUTA VERTICALE SENZA GUIDE LATERALI ... SUPERFICIE SCHERMATURA 1,90 mq`, entrambe `gtot 0,16`. La seconda riga non e' riconosciuta come prodotto. |
| daniele-miracapillo | Miracapillo | Stellino / Cosmet (infissi) | «materiale del quinto avvolgibile contrario ad alluminio» + «chiusure > finestre» | fattura: `N. 5 teli avvolgibili in alluminio coibentato modello Nova HD` con 5 misure; il «pvc» sta in una nota del cassonetto (`traverso in pvc`, `calotta in pvc`), non del telo. Serramenti: 3 PF 1 anta + 1 F 2 ante (+fisso) + 1 scorrevole = 5, confermati dal DoP (pos. 1+1+2+1). 5 chiusure per 5 infissi. |

Regola che il lettore deve rispettare (istruzione del titolare, 17/09): **il numero di prodotti si
legge dalle righe di fattura, tutte, e si confronta con il form; una riga con «tenda/telo/…» e una
misura o una superficie e' un prodotto anche se il modello non e' nel vocabolario. Un materiale si
attribuisce a un prodotto solo se sta nella sua riga, non in una riga vicina di un altro componente.**

**Regola del titolare, 17/09 (Miracapillo):** la fattura di **saldo** vale sempre piu' della
fattura di **acconto**, per qualsiasi rivenditore. Se divergono su misure/quantita'/descrizione,
comanda il saldo senza domanda; l'acconto conta solo per il totale. Certificato/DoP concorde col saldo.
