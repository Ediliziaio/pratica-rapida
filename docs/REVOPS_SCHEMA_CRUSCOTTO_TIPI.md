# Revenue Operations — Schema strutturale del cruscotto per M5

**Stato:** evidenza schema-only fornita dal Titolare  
**Data:** 31 agosto 2026  
**Progetto Supabase:** `xmkjrhwmmuzaqjqlvzxm`  
**Contenuto:** nomi, tipi e nullabilità; nessun record o valore aziendale

## `cruscotto_archivio`

| Colonna | Tipo | Nullable |
|---|---|---|
| `id` | `text` | no |
| `data_chiusura` | `timestamptz` | no |
| `mese` | `integer` | no |
| `anno` | `integer` | no |
| `saldi` | `jsonb` | no |
| `spese` | `jsonb` | no |
| `crediti` | `jsonb` | no |
| `pratiche` | `jsonb` | no |
| `impostazioni` | `jsonb` | no |
| `calc` | `jsonb` | no |
| `created_at` | `timestamptz` | no |

## `cruscotto_crediti`

| Colonna | Tipo | Nullable |
|---|---|---|
| `id` | `uuid` | no |
| `data` | `date` | no |
| `data_incasso` | `date` | sì |
| `cliente` | `text` | no |
| `n_fattura` | `text` | no |
| `classificazione` | `text` | no |
| `stato` | `text` | no |
| `note` | `text` | no |
| `importo` | `numeric` | no |
| `crm_pratica_id` | `uuid` | sì |
| `created_at` | `timestamptz` | no |
| `updated_at` | `timestamptz` | no |

## `cruscotto_impostazioni`

| Colonna | Tipo | Nullable |
|---|---|---|
| `chiave` | `text` | no |
| `valore` | `jsonb` | no |
| `updated_at` | `timestamptz` | no |

## `cruscotto_pratiche`

| Colonna | Tipo | Nullable |
|---|---|---|
| `id` | `uuid` | no |
| `data` | `date` | no |
| `rivenditore` | `text` | no |
| `cliente` | `text` | no |
| `tipo_omaggio` | `text` | no |
| `origine` | `text` | no |
| `numero` | `integer` | no |
| `numero_omaggi` | `integer` | no |
| `prezzo_unitario` | `numeric` | no |
| `fatturato` | `numeric` | no |
| `rivenditore_id` | `uuid` | sì |
| `crm_pratica_id` | `uuid` | sì |
| `created_at` | `timestamptz` | no |
| `updated_at` | `timestamptz` | no |

## `cruscotto_pratiche_da_crm`

| Colonna | Tipo | Nullable |
|---|---|---|
| `id` | `uuid` | no |
| `crm_pratica_id` | `uuid` | no |
| `crm_reseller_id` | `uuid` | sì |
| `rivenditore_nome` | `text` | no |
| `rivenditore_email` | `text` | no |
| `cliente_nome` | `text` | no |
| `cliente_cognome` | `text` | no |
| `brand` | `text` | no |
| `stato` | `text` | no |
| `nota` | `text` | no |
| `entrato_in_stage_at` | `timestamptz` | no |
| `ricevuto_at` | `timestamptz` | no |
| `cruscotto_pratica_id` | `uuid` | sì |
| `importata_at` | `timestamptz` | sì |

## `cruscotto_ricorrenze`

| Colonna | Tipo | Nullable |
|---|---|---|
| `id` | `uuid` | no |
| `nome` | `text` | no |
| `conto` | `text` | no |
| `tipo` | `text` | no |
| `frequenza` | `text` | no |
| `fine_ricorrenza` | `text` | no |
| `importo` | `numeric` | no |
| `data_inizio` | `date` | no |
| `attiva` | `boolean` | no |
| `created_at` | `timestamptz` | no |
| `updated_at` | `timestamptz` | no |

## `cruscotto_ricorrenze_escluse`

| Colonna | Tipo | Nullable |
|---|---|---|
| `id` | `uuid` | no |
| `id_ricorrenza` | `uuid` | no |
| `mese` | `text` | no |
| `created_at` | `timestamptz` | no |

## `cruscotto_rivenditori`

| Colonna | Tipo | Nullable |
|---|---|---|
| `id` | `uuid` | no |
| `nome` | `text` | no |
| `email` | `text` | no |
| `prezzo` | `numeric` | no |
| `omaggio_iniziale_usato` | `boolean` | no |
| `omaggio_straordinario_disponibile` | `boolean` | no |
| `crm_company_id` | `uuid` | sì |
| `created_at` | `timestamptz` | no |
| `updated_at` | `timestamptz` | no |

## `cruscotto_spese`

| Colonna | Tipo | Nullable |
|---|---|---|
| `id` | `uuid` | no |
| `data` | `date` | no |
| `descrizione` | `text` | no |
| `conto` | `text` | no |
| `tipo` | `text` | no |
| `competenza` | `text` | no |
| `frequenza` | `text` | no |
| `fine_ricorrenza` | `text` | no |
| `importo` | `numeric` | no |
| `id_ricorrenza` | `uuid` | sì |
| `generata` | `boolean` | no |
| `created_at` | `timestamptz` | no |
| `updated_at` | `timestamptz` | no |

## `cruscotto_v_crm_pratiche_chiuse` (view)

Tutte le colonne risultano nullable.

| Colonna | Tipo |
|---|---|
| `crm_pratica_id` | `uuid` |
| `crm_company_id` | `uuid` |
| `cruscotto_pratica_id` | `uuid` |
| `rivenditore` | `text` |
| `titolo` | `text` |
| `categoria` | `text` |
| `pagamento_stato` | `text` |
| `prezzo` | `numeric(10,2)` |
| `is_free` | `boolean` |
| `gia_importata` | `boolean` |
| `completata_at` | `timestamptz` |
| `data_chiusura` | `date` |

## Limite dell'evidenza

Questo documento non contiene valori, definizioni testuali di funzioni o
policy, chiavi, default, vincoli, indici o identificatori personali. Per M5
dimostra esclusivamente esistenza, tipo e nullabilità dichiarati nello snapshot.
