

# Creazione Pratiche ENEA di Esempio

## Dati disponibili

4 aziende, ognuna riceverà 3-5 pratiche ENEA (`categoria = 'enea_bonus'`):

| Azienda | Clienti disponibili |
|---------|-------------------|
| Domus Group | Nessun cliente → pratiche senza cliente |
| Studio Rossi & Associati | Marco Bianchi, Laura Verdi, Giuseppe Neri |
| Edilizia Moderna SRL | Anna Ferrari, Roberto Colombo, Silvia Ricci, Florin Andriciuc |
| Finanza Facile SPA | Paolo Moretti, Chiara Gallo, Davide Conti |

## Pratiche da creare (16 totali)

Userò `creato_da = '1067905a-1545-4285-b64c-f378c6c43cb8'` (unico profilo esistente).

### Domus Group (3 pratiche)
1. "ENEA Sostituzione infissi - Via Roma 12" → completata, pagata, €180
2. "ENEA Caldaia a condensazione - Via Milano 5" → in_lavorazione, non_pagata, €150
3. "ENEA Pompa di calore - Via Napoli 8" → bozza, non_pagata, €200

### Studio Rossi (5 pratiche)
1. "ENEA Cappotto termico - Bianchi" → completata, pagata, €250
2. "ENEA Pannelli solari - Verdi" → inviata, non_pagata, €180
3. "ENEA Sostituzione infissi - Neri" → in_attesa_documenti, non_pagata, €160
4. "ENEA Caldaia - Bianchi" → in_lavorazione, in_verifica, €150
5. "ENEA Coibentazione tetto - Verdi" → bozza, non_pagata, €220

### Edilizia Moderna (5 pratiche)
1. "ENEA Superbonus cappotto - Ferrari" → completata, pagata, €300
2. "ENEA Pompa di calore - Colombo" → completata, pagata, €200
3. "ENEA Infissi PVC - Ricci" → in_lavorazione, non_pagata, €170
4. "ENEA Solare termico - Andriciuc" → inviata, non_pagata, €190
5. "ENEA Caldaia ibrida - Ferrari" → annullata, non_pagata, €160

### Finanza Facile (3 pratiche)
1. "ENEA Ecobonus infissi - Moretti" → completata, pagata, €180
2. "ENEA Pompa di calore - Gallo" → in_attesa_documenti, in_verifica, €210
3. "ENEA Pannelli fotovoltaici - Conti" → inviata, non_pagata, €240

## Metodo

Inserimento diretto tramite tool di insert con 16 `INSERT INTO pratiche` statements. Ogni pratica avrà `dati_pratica` JSONB con dati ENEA realistici (tipo intervento, dati catastali, data fine lavori).

