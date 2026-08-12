import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EneaLab from "./pages/EneaLab";
import EneaShadowCrm from "./pages/EneaShadowCrm";
import { ENEA_SHADOW_CRM_PATH } from "./appBootstrap";

const previewQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

export default function EneaLabPreviewApp() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  if (pathname === ENEA_SHADOW_CRM_PATH) return <EneaShadowCrm />;
  return (
    <QueryClientProvider client={previewQueryClient}>
      <EneaLab />
    </QueryClientProvider>
  );
}
