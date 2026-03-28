import { lazy, Suspense, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { CompanyProvider } from "@/hooks/useCompany";
import { AppLayout } from "@/components/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RoleGuard } from "@/components/RoleGuard";
import { ThemeProvider } from "next-themes";

// Lazy-loaded pages
const Auth = lazy(() => import("./pages/Auth"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const NuovaPratica = lazy(() => import("./pages/NuovaPratica"));
const Pratiche = lazy(() => import("./pages/Pratiche"));
const WalletPage = lazy(() => import("./pages/Wallet"));
const PraticaDetail = lazy(() => import("./pages/PraticaDetail"));
const Aziende = lazy(() => import("./pages/Aziende"));
const CodaPratiche = lazy(() => import("./pages/CodaPratiche"));
const AdminPratiche = lazy(() => import("./pages/AdminPratiche"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Home = lazy(() => import("./pages/Home"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const CookiePolicy = lazy(() => import("./pages/CookiePolicy"));
const Clienti = lazy(() => import("./pages/Clienti"));
const AziendaDetail = lazy(() => import("./pages/AziendaDetail"));
const ImpostazioniPiattaforma = lazy(() => import("./pages/ImpostazioniPiattaforma"));
const ImpostazioniAzienda = lazy(() => import("./pages/ImpostazioniAzienda"));
const Assistenza = lazy(() => import("./pages/Assistenza"));
const AdminTicket = lazy(() => import("./pages/AdminTicket"));
const Blocked = lazy(() => import("./pages/Blocked"));
const FormPubblico = lazy(() => import("./pages/FormPubblico"));
const KanbanBoard = lazy(() => import("./pages/KanbanBoard"));
const NuovaPraticaEnea = lazy(() => import("./pages/rivenditore/NuovaPraticaEnea"));
const GestionaleAdmin = lazy(() => import("./pages/admin/Gestionale"));
const Automazioni = lazy(() => import("./pages/admin/Automazioni"));
const EneaDashboard = lazy(() => import("./pages/EneaDashboard"));
const ComunicazioniLog = lazy(() => import("./pages/ComunicazioniLog"));
const CalendarioChiamate = lazy(() => import("./pages/CalendarioChiamate"));
const ImpostazioniCampi = lazy(() => import("./pages/admin/ImpostazioniCampi"));
const PromoManager = lazy(() => import("./pages/admin/PromoManager"));
const ClientiAdmin = lazy(() => import("./pages/admin/ClientiAdmin"));
const ClienteDettaglio = lazy(() => import("./pages/admin/ClienteDettaglio"));
const EmailTemplates = lazy(() => import("./pages/admin/EmailTemplates"));
const WhatsappPanel = lazy(() => import("./pages/admin/WhatsappPanel"));

const queryClient = new QueryClient();

const INTERNAL_ROLES = ["super_admin", "admin_interno", "operatore"] as const;
const ADMIN_ROLES = ["super_admin"] as const;
const RESELLER_ROLES = ["rivenditore"] as const;
const ALL_AUTH_ROLES = [...INTERNAL_ROLES, ...RESELLER_ROLES] as const;

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function useOnboardingCheck() {
  const { user, roles } = useAuth();
  const isAzienda = roles.some(r => ["azienda_admin", "azienda_user"].includes(r));
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user || !isAzienda) { setNeedsOnboarding(false); return; }
    supabase.from("profiles").select("onboarding_completed").eq("id", user.id).single()
      .then(({ data }) => setNeedsOnboarding(data?.onboarding_completed === false));
  }, [user, isAzienda]);

  return needsOnboarding;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const needsOnboarding = useOnboardingCheck();

  if (loading || needsOnboarding === null) return <PageLoader />;
  if (!session) return <Navigate to="/auth" replace />;
  if (needsOnboarding) return <Navigate to="/onboarding" replace />;
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
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ErrorBoundary>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/offerta" element={<Home />} />
                <Route path="/home" element={<Home />} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/cookie-policy" element={<CookiePolicy />} />
                <Route path="/auth" element={<AuthRoute />} />
                <Route path="/blocked" element={<Blocked />} />
                <Route path="/form/:token" element={<FormPubblico />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/pratiche" element={<ProtectedRoute><Pratiche /></ProtectedRoute>} />
                <Route path="/pratiche/nuova" element={<ProtectedRoute><NuovaPratica /></ProtectedRoute>} />
                <Route path="/pratiche/:id" element={<ProtectedRoute><PraticaDetail /></ProtectedRoute>} />
                <Route path="/wallet" element={<ProtectedRoute><WalletPage /></ProtectedRoute>} />
                <Route path="/impostazioni" element={<ProtectedRoute><ImpostazioniAzienda /></ProtectedRoute>} />
                <Route path="/assistenza" element={<ProtectedRoute><Assistenza /></ProtectedRoute>} />
                <Route path="/clienti" element={<ProtectedRoute><Clienti /></ProtectedRoute>} />

                {/* Internal-only routes */}
                <Route path="/aziende" element={<ProtectedRoute><RoleGuard allowed={[...INTERNAL_ROLES]}><Aziende /></RoleGuard></ProtectedRoute>} />
                <Route path="/aziende/:id" element={<ProtectedRoute><RoleGuard allowed={[...INTERNAL_ROLES]}><AziendaDetail /></RoleGuard></ProtectedRoute>} />
                {/* Redirect legacy standalone routes to Impostazioni tabs */}
                <Route path="/utenti" element={<Navigate to="/admin/impostazioni" replace />} />
                <Route path="/listino" element={<Navigate to="/admin/impostazioni" replace />} />
                <Route path="/admin/audit-log" element={<Navigate to="/admin/impostazioni" replace />} />
                <Route path="/analytics" element={<Navigate to="/" replace />} />
                <Route path="/coda-pratiche" element={<ProtectedRoute><RoleGuard allowed={[...INTERNAL_ROLES]}><CodaPratiche /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/pratiche" element={<ProtectedRoute><RoleGuard allowed={[...INTERNAL_ROLES]}><AdminPratiche /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/ticket" element={<ProtectedRoute><RoleGuard allowed={[...INTERNAL_ROLES]}><AdminTicket /></RoleGuard></ProtectedRoute>} />

                {/* Super admin only */}
                <Route path="/admin/impostazioni" element={<ProtectedRoute><RoleGuard allowed={[...ADMIN_ROLES]}><ImpostazioniPiattaforma /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/campi" element={<ProtectedRoute><RoleGuard allowed={[...ADMIN_ROLES]}><ImpostazioniCampi /></RoleGuard></ProtectedRoute>} />

                {/* Pratica Rapida v2.0 — ENEA/CT */}
                {/* /kanban kept for resellers only */}
                <Route path="/kanban" element={<ProtectedRoute><RoleGuard allowed={[...RESELLER_ROLES]}><KanbanBoard /></RoleGuard></ProtectedRoute>} />
                <Route path="/enea/nuova" element={<ProtectedRoute><RoleGuard allowed={[...RESELLER_ROLES]}><NuovaPraticaEnea /></RoleGuard></ProtectedRoute>} />
                <Route path="/enea/dashboard" element={<ProtectedRoute><RoleGuard allowed={[...ALL_AUTH_ROLES]}><EneaDashboard /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/gestionale" element={<ProtectedRoute><RoleGuard allowed={[...INTERNAL_ROLES]}><GestionaleAdmin /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/automazioni" element={<ProtectedRoute><RoleGuard allowed={[...INTERNAL_ROLES]}><Automazioni /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/comunicazioni" element={<ProtectedRoute><RoleGuard allowed={[...INTERNAL_ROLES]}><ComunicazioniLog /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/calendario" element={<ProtectedRoute><RoleGuard allowed={[...INTERNAL_ROLES]}><CalendarioChiamate /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/promo" element={<ProtectedRoute><RoleGuard allowed={[...INTERNAL_ROLES]}><PromoManager /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/clienti" element={<ProtectedRoute><RoleGuard allowed={[...INTERNAL_ROLES]}><ClientiAdmin /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/clienti/:id" element={<ProtectedRoute><RoleGuard allowed={[...INTERNAL_ROLES]}><ClienteDettaglio /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/email" element={<ProtectedRoute><RoleGuard allowed={[...INTERNAL_ROLES]}><EmailTemplates /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/whatsapp" element={<ProtectedRoute><RoleGuard allowed={[...INTERNAL_ROLES]}><WhatsappPanel /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/calendario-eventi" element={<Navigate to="/admin/calendario" replace />} />

                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
