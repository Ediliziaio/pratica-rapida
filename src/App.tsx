import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { CompanyProvider } from "@/hooks/useCompany";
import { AppLayout } from "@/components/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import NuovaPratica from "./pages/NuovaPratica";
import Pratiche from "./pages/Pratiche";
import WalletPage from "./pages/Wallet";
import PraticaDetail from "./pages/PraticaDetail";
import Aziende from "./pages/Aziende";
import Utenti from "./pages/Utenti";
import CodaPratiche from "./pages/CodaPratiche";
import AdminPratiche from "./pages/AdminPratiche";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace />;
  return (
    <CompanyProvider>
      <AppLayout>{children}</AppLayout>
    </CompanyProvider>
  );
}

function AuthRoute() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/" replace />;
  return <Auth />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<AuthRoute />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/pratiche" element={<ProtectedRoute><Pratiche /></ProtectedRoute>} />
            <Route path="/pratiche/nuova" element={<ProtectedRoute><NuovaPratica /></ProtectedRoute>} />
            <Route path="/pratiche/:id" element={<ProtectedRoute><PraticaDetail /></ProtectedRoute>} />
            <Route path="/wallet" element={<ProtectedRoute><WalletPage /></ProtectedRoute>} />
            <Route path="/aziende" element={<ProtectedRoute><Aziende /></ProtectedRoute>} />
            <Route path="/utenti" element={<ProtectedRoute><Utenti /></ProtectedRoute>} />
            <Route path="/coda-pratiche" element={<ProtectedRoute><CodaPratiche /></ProtectedRoute>} />
            <Route path="/admin/pratiche" element={<ProtectedRoute><AdminPratiche /></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
