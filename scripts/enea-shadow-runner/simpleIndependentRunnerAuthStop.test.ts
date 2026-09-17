import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

const loadAuthenticationGuard = (root: string) => {
  const source = readFileSync(path.join(process.cwd(), "scripts/enea-shadow-runner/simple-independent-runner.mjs"), "utf8");
  const start = source.indexOf("function lostCrmSession(auth) {");
  const end = source.indexOf("\nfunction writeStallTrace", start);
  if (start < 0 || end < 0) throw new Error("runner_authentication_guard_not_found");
  const implementation = source.slice(start, end);
  const readJson = (target: string) => { try { return JSON.parse(readFileSync(target, "utf8")); } catch { return null; } };
  const customerCohortRoot = (item: { cohort: number }) => path.join(root, `cohort-${item.cohort}`);
  const runtimeRoot = path.join(root, "runtime");
  return Function("readJson", "path", "customerCohortRoot", "runtimeRoot", `${implementation}; return externalCrmAuthenticationFailure;`)(readJson, path, customerCohortRoot, runtimeRoot) as (item: { cohort: number }) => string | null;
};

const writeCheckpoint = (directory: string, value: unknown) => {
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "checkpoint.json"), JSON.stringify(value));
};

const temporaryRoot = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-runner-auth-stop-"));
  temporaryDirectories.push(root);
  return root;
};

/** Un checkpoint che ha davvero autenticato conserva accountFingerprint e l'evento nell'audit. */
const lostSessionCheckpoint = {
  status: "login_required",
  accountFingerprint: "c27774ae74d3f320df53b14565d517d6a52082f5af3e2159abecf97f3acb596e",
  reason: "Il server CRM ha rifiutato definitivamente il refresh token APR corrente; nuovo login necessario.",
  audit: [{ type: "authenticated", at: "2026-09-12T22:51:56.865Z" }, { type: "login_required", at: "2026-09-13T01:29:00.000Z" }],
};

/** Stato reale di una coorte appena creata da configure(): mai autenticata. */
const newbornCohortCheckpoint = {
  status: "login_required",
  accountFingerprint: null,
  tokenExpiresAt: null,
  lastVerifiedAt: null,
  reason: "Trasporto autenticato APR configurato; sessione utente dedicata ancora assente.",
  audit: [{ type: "initialized", at: "2026-09-13T01:30:03.000Z" }, { type: "configured", at: "2026-09-13T01:30:03.000Z" }],
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("arresto immediato del lotto su login CRM richiesto", () => {
  it("arresta su una sessione perduta senza aspettare il timeout della pratica", () => {
    const root = temporaryRoot();
    writeCheckpoint(path.join(root, "cohort-6453", "crm-auth"), lostSessionCheckpoint);

    expect(loadAuthenticationGuard(root)({ cohort: 6453 })).toContain("external_crm_authentication_unavailable:");
  });

  it("arresta anche quando la perdita e' registrata soltanto nello stato globale", () => {
    const root = temporaryRoot();
    writeCheckpoint(path.join(root, "runtime", "state", "crm-auth"), lostSessionCheckpoint);
    writeCheckpoint(path.join(root, "cohort-6455", "crm-auth"), newbornCohortCheckpoint);

    expect(loadAuthenticationGuard(root)({ cohort: 6455 })).toContain("external_crm_authentication_unavailable:");
  });

  it("non arresta per una coorte appena creata che non ha mai autenticato", () => {
    const root = temporaryRoot();
    writeCheckpoint(path.join(root, "cohort-6805", "crm-auth"), newbornCohortCheckpoint);

    expect(loadAuthenticationGuard(root)({ cohort: 6805 })).toBeNull();
  });

  it("non arresta per uno stato CRM autenticato", () => {
    const root = temporaryRoot();
    writeCheckpoint(path.join(root, "cohort-6454", "crm-auth"), { status: "authenticated" });

    expect(loadAuthenticationGuard(root)({ cohort: 6454 })).toBeNull();
  });
});
