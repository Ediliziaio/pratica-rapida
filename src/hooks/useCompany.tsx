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

  const setImpersonatedCompany = (id: string, name: string) => {
    setOverrideCompanyId(id);
    setOverrideCompanyName(name);
  };

  const clearImpersonation = () => {
    setOverrideCompanyId(null);
    setOverrideCompanyName(null);
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
