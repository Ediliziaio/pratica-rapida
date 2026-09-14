import { describe, expect, it } from "vitest";
import {
  buildNewsletterAudience,
  NEWSLETTER_LINKS,
  wrapNewsletterHtml,
  type NewsletterCompany,
  type NewsletterLead,
} from "./newsletterAudience";

const companies: NewsletterCompany[] = [
  { id: "active", ragione_sociale: "Rivenditore attivo", email: " INFO@example.com ", is_active: true, blocked_at: null },
  { id: "duplicate", ragione_sociale: "Duplicato", email: "info@example.com", is_active: true, blocked_at: null },
  { id: "inactive", ragione_sociale: "Inattivo", email: "inattivo@example.com", is_active: false, blocked_at: null },
  { id: "blocked", ragione_sociale: "Bloccato", email: "bloccato@example.com", is_active: true, blocked_at: "2026-09-01T10:00:00Z" },
  { id: "missing", ragione_sociale: "Senza email", email: null, is_active: true, blocked_at: null },
  { id: "invalid", ragione_sociale: "Email errata", email: "non-valida", is_active: true, blocked_at: null },
  { id: "private", ragione_sociale: "👤 Clienti privati — sito", email: "privati@example.com", is_active: true, blocked_at: null },
  { id: "test", ragione_sociale: "Prova Azienda", email: "prova@example.com", is_active: true, blocked_at: null },
  { id: "internal", ragione_sociale: "Pratica Rapida", email: "staff@example.com", is_active: true, blocked_at: null },
];

const leads: NewsletterLead[] = [
  { id: "lead", nome: "Nuovo", cognome: "Rivenditore", email: "lead@example.com", stage_id: "lead-stage", archived_at: null },
  { id: "lead-duplicate", nome: "Duplicato", cognome: "Azienda", email: "info@example.com", stage_id: "active-stage", archived_at: null },
  { id: "lead-private", nome: "Clienti privati", cognome: "sito", email: "privati-lead@example.com", stage_id: "lead-stage", archived_at: null },
  { id: "lead-archived", nome: "Archiviato", cognome: "", email: "archiviato@example.com", stage_id: "lead-stage", archived_at: "2026-09-01T10:00:00Z" },
  { id: "lead-typo", nome: "Email", cognome: "Errata", email: "cliente@gmail.con", stage_id: "lead-stage", archived_at: null },
];

describe("newsletter audience", () => {
  it("starts safely with zero recipients when no stage is selected", () => {
    const result = buildNewsletterAudience(companies, leads, {}, "active-stage", []);
    expect(result.recipients).toEqual([]);
    expect(result.noEmailCount).toBe(3);
  });

  it("includes only active, unblocked companies with valid unique emails", () => {
    const result = buildNewsletterAudience(companies, leads, {}, "active-stage", ["active-stage"]);
    expect(result.recipients).toEqual([
      { id: "active", ragione_sociale: "Rivenditore attivo", email: "INFO@example.com" },
    ]);
  });

  it("excludes private, test and internal system records", () => {
    const result = buildNewsletterAudience(companies, leads, {}, "active-stage", ["active-stage"]);
    expect(result.recipients.map(recipient => recipient.id)).not.toEqual(
      expect.arrayContaining(["private", "test", "internal"]),
    );
  });

  it("respects explicit pipeline assignments", () => {
    const result = buildNewsletterAudience(
      companies,
      leads,
      { active: "other-stage" },
      "active-stage",
      ["active-stage"],
    );
    expect(result.recipients).toEqual([
      { id: "duplicate", ragione_sociale: "Duplicato", email: "info@example.com" },
    ]);
  });

  it("includes current leads but excludes archived, private and typo-domain records", () => {
    const result = buildNewsletterAudience(companies, leads, {}, "active-stage", ["lead-stage"]);
    expect(result.recipients).toEqual([
      { id: "lead", ragione_sociale: "Nuovo Rivenditore", email: "lead@example.com" },
    ]);
  });
});

describe("newsletter presentation", () => {
  it("uses the green logo and the two approved calls to action", () => {
    const html = wrapNewsletterHtml("<p>Corpo newsletter</p>");
    expect(html).toContain(NEWSLETTER_LINKS.logo);
    expect(html).toContain(NEWSLETTER_LINKS.information);
    expect(html).toContain(NEWSLETTER_LINKS.newPractice);
    expect(html).toContain(NEWSLETTER_LINKS.optOut);
    expect(html).toContain("modulistica@praticarapida.it");
    expect(html).toContain("Corpo newsletter");
  });
});
