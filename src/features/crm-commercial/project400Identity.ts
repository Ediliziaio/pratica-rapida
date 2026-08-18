export type Project400IdentityEvidence = "email" | "phone" | "phone-national";
export type Project400IdentityStatus = "matched" | "needs_review" | "ambiguous" | "unmatched";

export interface Project400ContactIdentity {
  id: string;
  email?: string | null;
  phone?: string | null;
}

export interface Project400CompanyIdentity {
  id: string;
  email?: string | null;
  phone?: string | null;
}

export interface Project400IdentityResolution {
  status: Project400IdentityStatus;
  companyId: string | null;
  matchedBy: Project400IdentityEvidence[];
  candidateCompanyIds: string[];
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = (value ?? "").trim().toLocaleLowerCase("it");
  return normalized || null;
}

function normalizePhoneStrong(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits || null;
}

/**
 * Variante solo di revisione: +39/0039 e numero nazionale possono riferirsi
 * alla stessa utenza, ma non vengono auto-uniti perché il vecchio CRM può
 * contenere numeri internazionali o formati incompleti.
 */
function normalizePhoneNational(value: string | null | undefined): string | null {
  const strong = normalizePhoneStrong(value);
  if (!strong) return null;
  if (strong.startsWith("39") && strong.length >= 11) return strong.slice(2);
  return strong;
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function resolveProject400Identity(
  contact: Project400ContactIdentity,
  companies: Project400CompanyIdentity[],
): Project400IdentityResolution {
  const email = normalizeEmail(contact.email);
  const phoneStrong = normalizePhoneStrong(contact.phone);
  const phoneNational = normalizePhoneNational(contact.phone);

  const strongEvidence = new Map<string, Set<Project400IdentityEvidence>>();
  const softCandidates = new Set<string>();

  for (const company of companies) {
    const companyEmail = normalizeEmail(company.email);
    const companyPhoneStrong = normalizePhoneStrong(company.phone);
    const companyPhoneNational = normalizePhoneNational(company.phone);

    const evidence = strongEvidence.get(company.id) ?? new Set<Project400IdentityEvidence>();
    if (email && companyEmail && email === companyEmail) evidence.add("email");
    if (phoneStrong && companyPhoneStrong && phoneStrong === companyPhoneStrong) evidence.add("phone");
    if (evidence.size > 0) strongEvidence.set(company.id, evidence);

    if (
      phoneNational
      && companyPhoneNational
      && phoneNational === companyPhoneNational
      && phoneStrong !== companyPhoneStrong
    ) {
      softCandidates.add(company.id);
    }
  }

  const strongIds = sorted(strongEvidence.keys());
  const softIds = sorted(softCandidates);
  const allCandidateIds = sorted([...strongIds, ...softIds]);

  if (strongIds.length > 1) {
    return {
      status: "ambiguous",
      companyId: null,
      matchedBy: [],
      candidateCompanyIds: allCandidateIds,
    };
  }

  if (strongIds.length === 1) {
    const companyId = strongIds[0];
    const conflictingSoft = softIds.some((candidateId) => candidateId !== companyId);
    if (conflictingSoft) {
      return {
        status: "ambiguous",
        companyId: null,
        matchedBy: [],
        candidateCompanyIds: allCandidateIds,
      };
    }

    return {
      status: "matched",
      companyId,
      matchedBy: [...(strongEvidence.get(companyId) ?? [])].sort(),
      candidateCompanyIds: [companyId],
    };
  }

  if (softIds.length > 1) {
    return {
      status: "ambiguous",
      companyId: null,
      matchedBy: ["phone-national"],
      candidateCompanyIds: softIds,
    };
  }

  if (softIds.length === 1) {
    return {
      status: "needs_review",
      companyId: null,
      matchedBy: ["phone-national"],
      candidateCompanyIds: softIds,
    };
  }

  return {
    status: "unmatched",
    companyId: null,
    matchedBy: [],
    candidateCompanyIds: [],
  };
}
