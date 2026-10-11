import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const stageSource = readFileSync(
  path.resolve(process.cwd(), "supabase/functions/on-stage-changed/index.ts"),
  "utf8",
);
const deploySource = readFileSync(
  path.resolve(process.cwd(), ".github/workflows/deploy.yml"),
  "utf8",
);

describe("review delivery safety", () => {
  it("invia la vera richiesta iniziale sui due canali e la registra", () => {
    expect(stageSource).toContain('template_name: "invio_avvenuto_recensione"');
    expect(stageSource).toContain('template: "recensione"');
    expect(stageSource).toContain('trigger_event: "recensione_initial"');
  });

  it("non marca la recensione richiesta per la sola consegna della pratica", () => {
    expect(stageSource).toContain("if (reviewEmailOk || reviewWhatsappOk)");
    expect(stageSource).not.toContain("if (clientEmailOk || clientWaOk)");
  });

  it("limita anche la mail recensione ai clienti del servizio completo", () => {
    expect(stageSource).toContain("if (waAlCliente && clientEmailOk && practice.cliente_email)");
    expect(stageSource).toContain('steps.review_email = "recipient_not_contactable"');
  });

  it("rende deterministico e bloccante il deploy delle funzioni", () => {
    expect(deploySource.match(/version: 2\.117\.0/g)).toHaveLength(2);
    expect(deploySource).toContain('echo "::error::The following functions failed to deploy: ${FAILED[*]}"');
    expect(deploySource).toContain("exit 1");
  });
});
