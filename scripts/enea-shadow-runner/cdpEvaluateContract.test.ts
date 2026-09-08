import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { APR_CDP_EVALUATION_CONTRACTS } from "./cdpClient";

const WRAPPERS = new Set([
  "evaluateDomRead",
  "evaluateShortMutation",
  "evaluateNestedSave",
  "evaluateServerReconciliation",
]);

describe("contratto AST dei timeout Runtime.evaluate", () => {
  it("vieta evaluate generico e richiede un wrapper tipizzato a ogni chiamata del driver", () => {
    const filePath = path.join(process.cwd(), "scripts/enea-shadow-runner/cdpEneaBrowserDriver.ts");
    const sourceText = readFileSync(filePath, "utf8");
    const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const generic: Array<{ line: number; name: string }> = [];
    const classified: Array<{ line: number; name: string }> = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const name = node.expression.name.text;
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        if (name === "evaluate") generic.push({ line, name });
        if (WRAPPERS.has(name)) classified.push({ line, name });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);

    expect(generic, "Ogni Runtime.evaluate deve dichiarare una classe di timeout").toEqual([]);
    expect(classified.length).toBeGreaterThan(100);
    expect(new Set(classified.map((item) => item.name))).toEqual(WRAPPERS);
  });

  it("rende il default implicito inaccessibile dall'API pubblica del client", () => {
    const filePath = path.join(process.cwd(), "scripts/enea-shadow-runner/cdpClient.ts");
    const sourceText = readFileSync(filePath, "utf8");
    const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const publicGenericEvaluate: number[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "evaluate") {
        publicGenericEvaluate.push(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(publicGenericEvaluate).toEqual([]);
  });

  it("vieta cicli async nel wrapper DOM_READ e classifica la preparazione form come mutazione", () => {
    const filePath = path.join(process.cwd(), "scripts/enea-shadow-runner/cdpEneaBrowserDriver.ts");
    const sourceText = readFileSync(filePath, "utf8");
    const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const asyncDomReads: number[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "evaluateDomRead") {
        const expression = node.arguments[0]?.getText(source) ?? "";
        if (expression.includes("(async") || expression.includes("await wait")) asyncDomReads.push(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(asyncDomReads, "DOM_READ non puo contenere attese in-page").toEqual([]);
    expect(sourceText).toMatch(/fillAndReadStable[\s\S]*?return client\.evaluateShortMutation/);
  });

  it("impone probe DOM sincroni e polling Node per i marker React", () => {
    const clientSource = readFileSync(path.join(process.cwd(), "scripts/enea-shadow-runner/cdpClient.ts"), "utf8");
    const driverSource = readFileSync(path.join(process.cwd(), "scripts/enea-shadow-runner/cdpEneaBrowserDriver.ts"), "utf8");
    expect(clientSource).toMatch(/evaluateDomRead<T>\(expression: string, awaitPromise = false\)/);
    expect(driverSource).toMatch(/const waitForMarkers = \(\) => pollBooleanDomReadOnly\([\s\S]*?evaluateDomRead<boolean>/);
    expect(driverSource).not.toMatch(/const waitForMarkers = \(\) => client\.evaluateServerReconciliation/);
    expect(driverSource).not.toMatch(/directMarkersPresent = await client\.evaluateServerReconciliation/);
  });

  it("impone una deadline in-page alla GET autorevole dei Comuni prima del limite CDP", () => {
    const sourceText = readFileSync(path.join(process.cwd(), "scripts/enea-shadow-runner/cdpEneaBrowserDriver.ts"), "utf8");
    expect(sourceText).toMatch(/const controller=new AbortController\(\),fetchDeadline=setTimeout\(\(\)=>controller\.abort\(\),15000\)/);
    expect(sourceText).toMatch(/geo\/comuni\?search=[\s\S]*?signal:controller\.signal[\s\S]*?finally\{clearTimeout\(fetchDeadline\)\}/);
    expect(15_000).toBeLessThan(APR_CDP_EVALUATION_CONTRACTS.SHORT_MUTATION.timeoutMs);
  });

  it("spezza la compilazione React al confine di un solo campo per comando CDP", () => {
    const sourceText = readFileSync(path.join(process.cwd(), "scripts/enea-shadow-runner/cdpEneaBrowserDriver.ts"), "utf8");
    expect(sourceText).toMatch(/fillAndReadStableSingleCommand\(client, \[field\]\)/);
    expect(sourceText).not.toMatch(/fillAndReadStableSingleCommand\(client, (?:step\.)?fields\)/);
    expect(sourceText).toMatch(/for \(const field of pending\) await this\.fillAndReadStableSingleCommand/);
  });

  it("vieta la navigazione generica nei percorsi del keepalive read-only", () => {
    const filePath = path.join(process.cwd(), "scripts/enea-shadow-runner/cdpEneaBrowserDriver.ts");
    const sourceText = readFileSync(filePath, "utf8");
    const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const protectedMethods = new Set(["ensureAllowedLocation", "verifySession", "inspectPortalContractReadOnly"]);
    const genericNavigations: Array<{ method: string; line: number }> = [];
    const visit = (node: ts.Node) => {
      if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && protectedMethods.has(node.name.text)) {
        const methodName = node.name.text;
        const inspect = (candidate: ts.Node) => {
          if (ts.isCallExpression(candidate)
            && ts.isPropertyAccessExpression(candidate.expression)
            && candidate.expression.name.text === "navigate") {
            genericNavigations.push({ method: methodName, line: source.getLineAndCharacterOfPosition(candidate.getStart(source)).line + 1 });
          }
          ts.forEachChild(candidate, inspect);
        };
        inspect(node);
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(genericNavigations, "Il keepalive non puo acquisire una capability mutativa per tornare alla dashboard").toEqual([]);
    expect(sourceText).toMatch(/inspectPortalContractReadOnly[\s\S]*?navigateReadonlyGet\(`\$\{this\.allowedOrigin\}\$\{safeDashboard\.path\}`, this\.allowedOrigin\)/);
  });
});
