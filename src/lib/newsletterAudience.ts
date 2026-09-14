export interface NewsletterCompany {
  id: string;
  ragione_sociale: string;
  email: string | null;
  is_active: boolean | null;
  blocked_at: string | null;
}

export interface NewsletterRecipient {
  id: string;
  ragione_sociale: string;
  email: string;
}

export interface NewsletterLead {
  id: string;
  nome: string | null;
  cognome: string | null;
  email: string | null;
  stage_id: string | null;
  archived_at: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NON_RESELLER_NAME_RE = /(?:^|\b)(prova|test|pratica\s*rapida|intern[oa]|demo)(?:\b|$)|da abbinare|rivenditore eliminato|clienti privati/i;
const SUSPICIOUS_EMAIL_DOMAIN_RE = /(?:gmail\.con|gimail\.it|gmail\.it)$/i;

function hasDeliverableEmail(value: string | null): boolean {
  const email = value?.trim() ?? "";
  return EMAIL_RE.test(email) && !SUSPICIOUS_EMAIL_DOMAIN_RE.test(email.split("@")[1] ?? "");
}

export function isExcludedNewsletterCompany(company: NewsletterCompany): boolean {
  return company.is_active !== true
    || Boolean(company.blocked_at)
    || NON_RESELLER_NAME_RE.test(company.ragione_sociale.trim());
}

export const NEWSLETTER_LINKS = {
  logo: "https://www.praticarapida.it/pratica-rapida-logo.png",
  information: "https://wa.me/390398682691?text=Vorrei%20ricevere%20maggiori%20informazioni",
  optOut: "https://wa.me/390398682691?text=Non%20desidero%20ricevere%20altri%20aggiornamenti",
  newPractice: "https://app.praticarapida.it/enea/nuova",
  website: "https://www.praticarapida.it",
} as const;

/** Replica il template newsletter DB per mostrare un'anteprima fedele. */
export function wrapNewsletterHtml(bodyHtml: string): string {
  return `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
      <div style="background:#ffffff;padding:20px 24px;border:1px solid #e5e7eb;border-bottom:none;border-radius:12px 12px 0 0;text-align:center;">
        <img src="${NEWSLETTER_LINKS.logo}" alt="Pratica Rapida" width="220" style="display:block;width:220px;max-width:100%;height:auto;margin:0 auto;">
      </div>
      <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-top:none;font-size:15px;line-height:1.6;">
        ${bodyHtml}
        <div style="margin-top:30px;padding:22px;background:#f3faf6;border:1px solid #cfe8d8;border-radius:10px;text-align:center;">
          <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#14532d;">Vuoi maggiori informazioni o inserire la prima pratica?</p>
          <a href="${NEWSLETTER_LINKS.information}" style="display:inline-block;margin:4px;background:#00843D;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:700;">Chiedi informazioni</a>
          <a href="${NEWSLETTER_LINKS.newPractice}" style="display:inline-block;margin:4px;background:#ffffff;color:#00843D;border:1px solid #00843D;padding:11px 20px;border-radius:6px;text-decoration:none;font-weight:700;">Inserisci una pratica</a>
        </div>
      </div>
      <div style="background:#f7f7f7;padding:16px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;text-align:center;font-size:12px;line-height:1.6;color:#6b7280;">
        Le risposte a questa email arrivano a modulistica@praticarapida.it.<br>
        Per assistenza puoi anche usare il pulsante “Chiedi informazioni”. · <a href="${NEWSLETTER_LINKS.website}" style="color:#00843D;">praticarapida.it</a><br>
        Non desideri ricevere altri aggiornamenti? <a href="${NEWSLETTER_LINKS.optOut}" style="color:#00843D;">Richiedi la cancellazione</a>.
      </div>
    </div>`;
}

/**
 * Costruisce il pubblico newsletter in modo fail-closed.
 *
 * Sono ammessi soltanto record della tabella aziende esplicitamente attivi e
 * non bloccati. Nessuna fase selezionata equivale sempre a zero destinatari.
 */
export function buildNewsletterAudience(
  companies: NewsletterCompany[],
  leads: NewsletterLead[],
  assignments: Record<string, string>,
  firstStageId: string | undefined,
  selectedStages: string[],
) {
  const eligibleCompanies = companies
    .filter(company => !isExcludedNewsletterCompany(company))
    .map(company => ({
      ...company,
      stage: assignments[company.id] ?? firstStageId,
    }));

  const eligibleLeads = leads
    .filter(lead => !lead.archived_at)
    .map(lead => ({
      id: lead.id,
      ragione_sociale: `${lead.nome ?? ""} ${lead.cognome ?? ""}`.trim() || "Rivenditore",
      email: lead.email,
      stage: lead.stage_id ?? firstStageId,
    }))
    .filter(lead => !NON_RESELLER_NAME_RE.test(lead.ragione_sociale));

  const eligible = [...eligibleCompanies, ...eligibleLeads];

  const noEmailCount = eligible.filter(company => {
    const email = company.email?.trim() ?? "";
    return !hasDeliverableEmail(email);
  }).length;

  if (selectedStages.length === 0) {
    return { recipients: [] as NewsletterRecipient[], noEmailCount };
  }

  const selected = new Set(selectedStages);
  const seenEmails = new Set<string>();
  const recipients: NewsletterRecipient[] = [];

  for (const company of eligible) {
    if (!company.stage || !selected.has(company.stage)) continue;
    const email = company.email?.trim() ?? "";
    if (!hasDeliverableEmail(email)) continue;
    const normalizedEmail = email.toLowerCase();
    if (seenEmails.has(normalizedEmail)) continue;
    seenEmails.add(normalizedEmail);
    recipients.push({
      id: company.id,
      ragione_sociale: company.ragione_sociale,
      email,
    });
  }

  return { recipients, noEmailCount };
}
