# Patch: data di nascita dal CF verificato + cognome composto (Della Vedova) — 16/09/2026

Da applicare a lotto fermo: `git apply ops/apr-data-nascita-dal-cf-e-cognome-composto-2026-09-16.patch`

Due regole del titolare (16/09/2026), caso Giancarlo Della Vedova (giro r127: fermo con
`primary_beneficiary_invoice_identity_conflict`, causa vera: anno di nascita del form 1976 contro CF 1963).

1. `user-2026-09-16-birth-date-from-verified-fiscal-code-v1` — «triangolazione»: CF del modulo = CF
   stampato in fattura → il CF e' provato → se la data digitata contraddice solo l'anno, vale il CF
   (secolo unico con eta' 18–110). Giorno/mese discordi restano fail-closed con blocker nuovo
   `primary_beneficiary_birth_date_conflict` (messaggio che dice la causa vera).
2. `user-2026-09-16-invoice-person-name-split-from-form-v1` — cognomi composti: fra i tagli coerenti
   col CF vince quello che coincide con nome/cognome del modulo (era «Della», ora «Della Vedova»).

File: crmLocalPreflight.ts (+ tipo report: `conflictKind`, `birthDateSource`), crmLocalPreflight.test.ts
(5 test nuovi dichiarati in matrice; il vecchio «resta fail-closed se il secolo…» sostituito con
motivazione; due `toEqual` → `toMatchObject` per il campo informativo nuovo), operationalRegistry.ts
(v176, provenienza 2026-09-16), operationalRegistry.test.ts (versione), ruleTestMatrix.ts (v192).

Verifiche nel mirror: typecheck runner e app puliti; crmLocalPreflight 147/147; suite
src/features/enea-shadow-crm verde (i 4 di aprCrmReadOnlyContract falliscono nel mirror solo per il
file config assente li', nell'albero passano). Eseguito `buildCrmLocalPreflightReport` sulla coorte
reale 10361 di Della Vedova: zero blocker, identita' «Giancarlo Della Vedova», nascita 1963-09-16,
warning `birth_date_taken_from_verified_fiscal_code`.
