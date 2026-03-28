import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface OperatorPermissions {
  /** Can see all practices or only assigned ones */
  see_all_pratiche: boolean;
  /** Can see pricing/amounts (€) on practices */
  see_pricing: boolean;
  /** Can export to CSV/Excel */
  can_export: boolean;
  /** Can create new practices */
  can_create_pratiche: boolean;
  /** Can manage/edit client records */
  can_manage_clients: boolean;
  /** Can access Email / WhatsApp communications */
  can_use_communications: boolean;
  /** Can delete/archive practices */
  can_delete_pratiche: boolean;
}

export const DEFAULT_OPERATOR_PERMISSIONS: OperatorPermissions = {
  see_all_pratiche: true,
  see_pricing: true,
  can_export: true,
  can_create_pratiche: true,
  can_manage_clients: true,
  can_use_communications: false,
  can_delete_pratiche: false,
};

/** Returns the operator_permissions for the currently logged-in user.
 *  Super admin and admin_interno always get full permissions (returns all true).
 *  Operatore gets their configured settings (falls back to defaults if column missing).
 */
export function useOperatorPermissions(): OperatorPermissions {
  const { user, roles } = useAuth();

  const isFullAccess = roles.some(r => ["super_admin", "admin_interno"].includes(r));

  const { data } = useQuery({
    queryKey: ["operator-permissions", user?.id],
    enabled: !!user && !isFullAccess,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("operator_permissions")
        .eq("id", user!.id)
        .single();
      return data?.operator_permissions as OperatorPermissions | null;
    },
  });

  if (isFullAccess) {
    // Super admin / admin_interno: full access always
    return {
      see_all_pratiche: true,
      see_pricing: true,
      can_export: true,
      can_create_pratiche: true,
      can_manage_clients: true,
      can_use_communications: true,
      can_delete_pratiche: true,
    };
  }

  // Merge fetched settings with defaults (handles missing keys gracefully)
  return { ...DEFAULT_OPERATOR_PERMISSIONS, ...(data ?? {}) };
}
