import { supabase } from "@/integrations/supabase/client";
import { getFunctionErrorMessage } from "@/lib/companyCredentials";

export interface CompanyCredentialTarget {
  id: string;
  ragione_sociale: string;
  email?: string | null;
}

export interface CompanyCredentialResult {
  loginEmail: string;
  deliveryEmail: string | null;
  emailSent: boolean;
}

function normalizeEmail(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

export function resolveCredentialAddresses(companyEmail?: string | null, accountEmail?: string | null) {
  const contactEmail = normalizeEmail(companyEmail);
  const loginEmail = normalizeEmail(accountEmail) ?? contactEmail;

  return {
    loginEmail,
    deliveryEmail: contactEmail ?? loginEmail,
  };
}

export async function updateCompanyCredentials({
  company,
  password,
  sendEmail,
}: {
  company: CompanyCredentialTarget;
  password: string;
  sendEmail: boolean;
}): Promise<CompanyCredentialResult> {
  if (password.length < 8) throw new Error("Password minimo 8 caratteri");

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sessione scaduta, rieffettua il login.");
  const authorization = { Authorization: `Bearer ${session.access_token}` };

  const { data: setResult, error: setError } = await supabase.functions.invoke("set-company-password", {
    body: { company_id: company.id, new_password: password },
    headers: authorization,
  });
  if (setError) {
    throw new Error(await getFunctionErrorMessage(setError, "Impostazione password fallita"));
  }

  const passwordResult = setResult as { success?: boolean; email?: string | null; error?: string };
  if (!passwordResult?.success) {
    throw new Error(passwordResult?.error ?? "Impostazione password fallita");
  }

  const { loginEmail, deliveryEmail } = resolveCredentialAddresses(company.email, passwordResult.email);
  if (!loginEmail) {
    throw new Error("Password impostata, ma manca l'indirizzo email usato per l'accesso");
  }

  if (!sendEmail) return { loginEmail, deliveryEmail, emailSent: false };
  if (!deliveryEmail) {
    throw new Error("Password impostata, ma email non inviata: nessun indirizzo di contatto disponibile");
  }

  const { data: emailResult, error: emailError } = await supabase.functions.invoke("send-email", {
    body: {
      to: deliveryEmail,
      template: "benvenuto_azienda",
      data: {
        ragione_sociale: company.ragione_sociale,
        email: loginEmail,
        password,
        login_url: "https://pannello.praticarapida.it",
      },
    },
    headers: authorization,
  });

  if (emailError) {
    const detail = await getFunctionErrorMessage(emailError, "Invio email fallito");
    throw new Error(`Password impostata, ma email non inviata: ${detail}`);
  }
  if (emailResult?.success !== true) {
    throw new Error(`Password impostata, ma email non inviata: ${emailResult?.error ?? "provider non disponibile"}`);
  }

  return { loginEmail, deliveryEmail, emailSent: true };
}
