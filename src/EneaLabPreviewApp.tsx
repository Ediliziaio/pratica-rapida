import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EneaLab from "./pages/EneaLab";

const previewQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

export default function EneaLabPreviewApp() {
  return (
    <QueryClientProvider client={previewQueryClient}>
      <EneaLab />
    </QueryClientProvider>
  );
}
