import { createContext, useContext, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface CompanyContextType {
  companyId: string | null;
  loading: boolean;
  isImpersonating: boolean;
  impersonatedCompanyName: string | null;
  setImpersonatedCompany: (id: string, name: string) => void;
  clearImpersonation: () => void;
}

const CompanyContext = createContext<CompanyContextType>({
  companyId: null,
  loading: true,
  isImpersonating: false,
  impersonatedCompanyName: null,
  setImpersonatedCompany: () => {},
  clearImpersonation: () => {},
});

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [overrideCompanyId, setOverrideCompanyId] = useState<string | null>(null);
  const [overrideCompanyName, setOverrideCompanyName] = useState<string | null>(null);

  const { data: originalCompanyId, isLoading } = useQuery({
    queryKey: ["user-company", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("user_company_assignments")
        .select("company_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      return data?.company_id ?? null;
    },
    enabled: !!user,
  });

  // Audit-log helper (non blocking — se fallisce l'operazione continua)
  const logImpersonationEvent = async (
    action: "impersonation_start" | "impersonation_end",
    targetCompanyId: string | null,
    targetCompanyName: string | null
  ) => {
    if (!user) return;
    try {
      await supabase.from("audit_log").insert({
        user_id: user.id,
        azione: action,
        dettagli: {
          target_company_id: targetCompanyId,
          target_company_name: targetCompanyName,
          actor_email: user.email,
        },
      });
    } catch (err) {
      console.warn("audit_log insert failed for impersonation event:", err);
    }
  };

  const setImpersonatedCompany = (id: string, name: string) => {
    setOverrideCompanyId(id);
    setOverrideCompanyName(name);
    void logImpersonationEvent("impersonation_start", id, name);
  };

  const clearImpersonation = () => {
    const prevId = overrideCompanyId;
    const prevName = overrideCompanyName;
    setOverrideCompanyId(null);
    setOverrideCompanyName(null);
    if (prevId) {
      void logImpersonationEvent("impersonation_end", prevId, prevName);
    }
  };

  return (
    <CompanyContext.Provider value={{
      companyId: overrideCompanyId || originalCompanyId || null,
      loading: isLoading,
      isImpersonating: !!overrideCompanyId,
      impersonatedCompanyName: overrideCompanyName,
      setImpersonatedCompany,
      clearImpersonation,
    }}>
      {children}
    </CompanyContext.Provider>
  );
}

export const useCompany = () => useContext(CompanyContext);
