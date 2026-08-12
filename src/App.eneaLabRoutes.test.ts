import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const appSource = fs.readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf8");
const appFile = ts.createSourceFile("App.tsx", appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function routeElement(pathname: string): string {
  let element: ts.JsxAttribute | undefined;

  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(appFile) === "Route") {
      const pathAttribute = node.attributes.properties.find(
        (attribute): attribute is ts.JsxAttribute =>
          ts.isJsxAttribute(attribute) && attribute.name.getText(appFile) === "path",
      );
      const pathValue = pathAttribute?.initializer;
      if (pathValue && ts.isStringLiteral(pathValue) && pathValue.text === pathname) {
        element = node.attributes.properties.find(
          (attribute): attribute is ts.JsxAttribute =>
            ts.isJsxAttribute(attribute) && attribute.name.getText(appFile) === "element",
        );
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(appFile);
  if (!element?.initializer || !ts.isJsxExpression(element.initializer)) {
    throw new Error(`Route ${pathname} assente o priva di element JSX.`);
  }
  return element.initializer.expression?.getText(appFile).replace(/\s+/g, " ") ?? "";
}

describe("contratto route ENEA Lab", () => {
  it("espone la preview fixture solo in DEV e la rimuove dalla build production", () => {
    expect(routeElement("/admin/enea-lab-preview")).toBe(
      'import.meta.env.DEV ? <EneaLabPreviewHandoff /> : <Navigate to="/" replace />',
    );
  });

  it("mantiene il laboratorio reale dietro autenticazione e ruoli staff in DEV", () => {
    expect(routeElement("/admin/enea-lab")).toBe(
      'import.meta.env.DEV ? <ProtectedRoute><RoleGuard allowed={[...STAFF_ROLES]}><EneaLab /></RoleGuard></ProtectedRoute> : <Navigate to="/" replace />',
    );
  });

  it("espone il CRM ombra isolato solo in DEV", () => {
    expect(routeElement("/admin/enea-crm-ombra")).toBe(
      'import.meta.env.DEV ? <EneaLabPreviewHandoff targetPath="/admin/enea-crm-ombra" /> : <Navigate to="/" replace />',
    );
  });
});
