#!/usr/bin/env node
import path from "node:path";
import { PersistentEneaRunner } from "./runner";
function option(name:string){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined;}
const command=process.argv[2]??"status"; const root=path.resolve(option("--state-dir")??".enea-shadow-runtime"); const runner=new PersistentEneaRunner(root); const owner="enea-draft"; const practice=option("--practice-id")??"audit-sara-agostinelli"; const now=new Date(option("--at")??new Date().toISOString());
if(command==="begin") runner.beginAuthorizedDraft(owner,practice,option("--command-id")??"sara-draft:begin:v1",now);
else if(command==="created") runner.recordDraftCreated(owner,practice,option("--draft-id")??"",option("--url")??"",option("--command-id")??"sara-draft:created:v1",now);
else if(command==="saved") runner.recordDraftSaved(owner,practice,option("--draft-id")??"",option("--url")??"",Number(option("--evidence-count")??"0"),option("--command-id")??"sara-draft:saved:v1",now);
else if(command==="failed") runner.recordDraftFailure(owner,practice,option("--reason")??"",option("--next-action")??"",option("--command-id")??`sara-draft:failed:${crypto.randomUUID()}`,now);
else if(command==="resolved-cf") runner.resumeDraftAfterVerifiedFiscalCode(owner,practice,{
  formFiscalCode: option("--form-cf")??"", resolvedFiscalCode: option("--resolved-cf")??"",
  sourceDocumentIds: (option("--source-ids")??"").split(","),
  identity: { surname: option("--surname")??"", name: option("--name")??"", birthDate: option("--birth-date")??"", sex: option("--sex")==="M"?"M":"F", birthPlaceCode: option("--birth-place-code")??"" },
}, option("--command-id")??"sara-draft:resolved-cf:v1", now);
else if(command==="resolved-building") runner.resumeDraftAfterSingleUnitQualification(owner,practice,{
  draftId: option("--draft-id")??"", totalUnits: Number(option("--total-units")??"0"),
  floorDescription: option("--floor-description")??"", explicitPrimaryContradiction: option("--primary-contradiction")==="true",
}, option("--command-id")??`${practice}:draft:resolved-building:v1`, now);
else if(command==="reopen-cardinality") runner.reopenSavedDraftForCardinalityCorrection(owner,practice,{
  draftId: option("--draft-id")??"", observedTechnicalRows:Number(option("--observed-rows")??"0"), expectedTechnicalRows:Number(option("--expected-rows")??"0"),
}, option("--command-id")??`${practice}:draft:reopen-cardinality:v1`, now);
else if(command==="audit-excluded-cardinality") runner.recordExcludedProductCardinalityAudit(owner,practice,{
  draftId:option("--draft-id")??"", sourceId:option("--source-id")??"", product:option("--product")??"",
  expectedPhysicalProducts:Number(option("--expected-products")??"0"), observedLedgerRows:Number(option("--observed-ledger-rows")??"0"),
  excludedGrossTotal:Number(option("--excluded-gross-total")??"0"), perPieceEvidence:option("--per-piece-evidence")??"",
}, option("--command-id")??`${practice}:draft:audit-excluded-cardinality:v1`, now);
else if(command==="reopen-zanzariere") runner.reopenSavedDraftForZanzariereInclusion(owner,practice,{
  draftId:option("--draft-id")??"",existingTechnicalRows:Number(option("--existing-rows")??"0"),zanzariereRows:Number(option("--zanzariere-rows")??"0"),
  previousQualifiedGross:Number(option("--previous-gross")??"0"),reconciledQualifiedGross:Number(option("--reconciled-gross")??"0"),
},option("--command-id")??`${practice}:draft:reopen-zanzariere:v1`,now);
else if(command==="saved-zanzariere") runner.recordZanzariereDraftReconciled(owner,practice,{
  draftId:option("--draft-id")??"",observedTechnicalRows:Number(option("--observed-rows")??"0"),zanzariereRows:Number(option("--zanzariere-rows")??"0"),
  qualifiedGross:Number(option("--qualified-gross")??"0"),totalScreeningAreaM2:Number(option("--total-area")??"0"),evidenceCount:Number(option("--evidence-count")??"0"),portalUrl:option("--url")??"",
},option("--command-id")??`${practice}:draft:saved-zanzariere:v1`,now);
else if(command==="comparison-completed") runner.recordReadOnlyComparisonCompleted(owner,practice,{
  draftId:option("--draft-id")??"",startedAt:option("--started-at")??"",endedAt:option("--ended-at")??"",
  comparedFieldCount:Number(option("--compared-fields")??"0"),discrepancyCount:Number(option("--discrepancies")??"0"),
  excludedFields:option("--excluded-fields")??"",sources:option("--sources")??"",
},option("--command-id")??`${practice}:comparison:${option("--draft-id")??"unknown"}:v1`,now);
else if(command!=="status") throw new Error("Comando bozza non valido.");
process.stdout.write(`${JSON.stringify(runner.load(),null,2)}\n`);
