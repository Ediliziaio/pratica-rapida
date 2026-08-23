import type { AprCrmReadOnlyFixture } from "../../../src/features/enea-shadow-crm/aprCrmReadOnlyContract";

const baseUrl = "https://crm.fixture.invalid";
export const VERIFIED_APR_CRM_READONLY_FIXTURE: AprCrmReadOnlyFixture = Object.freeze<AprCrmReadOnlyFixture>({
  version: "apr-crm-readonly-fixture-v1",
  fixtureId: "apr-crm-readonly-green-v1",
  adapterId: "apr-crm-local-fixture",
  workspaceIdentity: "praticarapida-local-fixture",
  exchanges: [
    { request: { id: "incoming", capability: "list_incoming_enea_practices", method: "GET", url: `${baseUrl}/api/practices/enea/incoming`, headers: { accept: "application/json" } },
      response: { transport: "local_fixture", status: 200, finalUrl: `${baseUrl}/api/practices/enea/incoming`, contentType: "application/json", body: JSON.stringify({ revision: 7, practices: [{ practiceId: "enea-fixture-1", customerId: "customer-fixture-1" }] }), serverVerified: true, observedMutation: false } },
    { request: { id: "customer", capability: "read_customer", method: "GET", url: `${baseUrl}/api/customers/customer-fixture-1`, headers: { accept: "application/json", "if-none-match": "fixture-etag" } },
      response: { transport: "local_fixture", status: 200, finalUrl: `${baseUrl}/api/customers/customer-fixture-1`, contentType: "application/json", body: JSON.stringify({ customerId: "customer-fixture-1", displayName: "Cliente Fixture" }), serverVerified: true, observedMutation: false } },
    { request: { id: "dossier", capability: "read_enea_dossier", method: "GET", url: `${baseUrl}/api/practices/enea-fixture-1/enea-dossier`, headers: { accept: "application/json" } },
      response: { transport: "local_fixture", status: 200, finalUrl: `${baseUrl}/api/practices/enea-fixture-1/enea-dossier`, contentType: "application/json", body: JSON.stringify({ practiceId: "enea-fixture-1", formSourceId: "form-1", invoiceSourceIds: ["invoice-1"] }), serverVerified: true, observedMutation: false } },
    { request: { id: "documents", capability: "read_document_metadata", method: "GET", url: `${baseUrl}/api/practices/enea-fixture-1/documents`, headers: { accept: "application/json" } },
      response: { transport: "local_fixture", status: 200, finalUrl: `${baseUrl}/api/practices/enea-fixture-1/documents`, contentType: "application/json", body: JSON.stringify({ documents: [{ documentId: "invoice-1", provenance: "original_invoice", contentType: "application/pdf" }] }), serverVerified: true, observedMutation: false } },
    { request: { id: "original-document", capability: "read_original_document", method: "HEAD", url: `${baseUrl}/api/documents/invoice-1/original`, headers: { accept: "application/pdf" } },
      response: { transport: "local_fixture", status: 200, finalUrl: `${baseUrl}/api/documents/invoice-1/original`, contentType: "application/pdf", body: "", serverVerified: true, observedMutation: false } },
  ],
});
