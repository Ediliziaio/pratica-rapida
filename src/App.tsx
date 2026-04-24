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
const NuovaPratica = lazy(() => import("./pages/NuovaPratica"));
const Pratiche = lazy(() => import("./pages/Pratiche"));
const WalletPage = lazy(() => import("./pages/Wallet"));
const PraticaDetail = lazy(() => import("./pages/PraticaDetail"));
const Aziende = lazy(() => import("./pages/Aziende"));
const CodaPratiche = lazy(() => import("./pages/CodaPratiche"));
const AdminPratiche = lazy(() => import("./pages/AdminPratiche"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Home = lazy(() => import("./pages/Home"));
const HomeCT = lazy(() => import("./pages/HomeCT"));
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
const ModuloClientePage = lazy(() => import("./pages/ModuloClientePage"));
const KanbanBoard = lazy(() => import("./pages/KanbanBoard"));
const NuovaPraticaEnea = lazy(() => import("./pages/rivenditore/NuovaPraticaEnea"));
const HomeMain = lazy(() => import("./pages/HomeMain"));
const AreaRiservataVecchia = lazy(() => import("./pages/AreaRiservataVecchia"));
const VecchioPraticaEnea = lazy(() => import("./pages/vecchio/PraticaEnea"));
const VecchioFotovoltaicoOffGrid = lazy(() => import("./pages/vecchio/FotovoltaicoOffGrid"));
const VecchioVisuraCatastale = lazy(() => import("./pages/vecchio/VisuraCatastale"));
const VecchioVerificaPrezzi = lazy(() => import("./pages/vecchio/VerificaPrezzi"));
const VecchioAllaccioFotovoltaico = lazy(() => import("./pages/vecchio/AllaccioFotovoltaico"));
const FAQPage = lazy(() => import("./pages/FAQ"));
const BlogPage = lazy(() => import("./pages/Blog"));
const BlogPostPage = lazy(() => import("./pages/BlogPost"));
const Automazioni = lazy(() => import("./pages/admin/Automazioni"));
const EneaDashboard = lazy(() => import("./pages/EneaDashboard"));
const ComunicazioniLog = lazy(() => import("./pages/ComunicazioniLog"));
const CalendarioChiamate = lazy(() => import("./pages/CalendarioChiamate"));
const ImpostazioniCampi = lazy(() => import("./pages/admin/ImpostazioniCampi"));
const PromoManager = lazy(() => import("./pages/admin/PromoManager"));
const AdminNews = lazy(() => import("./pages/AdminNews"));
const ClientiAdmin = lazy(() => import("./pages/admin/ClientiAdmin"));
const ClienteDettaglio = lazy(() => import("./pages/admin/ClienteDettaglio"));
const EmailTemplates = lazy(() => import("./pages/admin/EmailTemplates"));
const WhatsappPanel = lazy(() => import("./pages/admin/WhatsappPanel"));
const ArchivioEnea = lazy(() => import("./pages/rivenditore/ArchivioEnea"));

const queryClient = new QueryClient();

// STAFF = dipendenti interni Pratica Rapida (super_admin + operatore)
// admin_interno = admin aziendale del cliente → va nell'area /pratiche, NON in /admin/pratiche
const STAFF_ROLES  = ["super_admin", "operatore"] as const;
const ADMIN_ROLES  = ["super_admin"] as const;
const RESELLER_ROLES = ["rivenditore"] as const;
const ALL_AUTH_ROLES = [...STAFF_ROLES, "admin_interno", "azienda_admin", "azienda_user", ...RESELLER_ROLES] as const;

function isStaff(roles: string[]) {
  return roles.some(r => STAFF_ROLES.includes(r as (typeof STAFF_ROLES)[number]));
}

function isResellerRole(roles: string[]) {
  return roles.some(r => RESELLER_ROLES.includes(r as (typeof RESELLER_ROLES)[number]));
}

function RootRedirect() {
  const { roles } = useAuth();
  // Tutti i ruoli operativi ora atterrano su /kanban (pagina unificata Pipeline/Tabella)
  if (isStaff(roles)) return <Navigate to="/kanban" replace />;
  if (isResellerRole(roles)) return <Navigate to="/kanban" replace />;
  if (roles.some(r => ["admin_interno", "azienda_admin", "azienda_user"].includes(r))) {
    return <Navigate to="/kanban" replace />;
  }
  // Fallback: utente senza ruoli noti → Auth
  return <Navigate to="/auth" replace />;
}

// Rileva il sottodominio per distinguere sito marketing da piattaforma:
// - app.praticarapida.it  → piattaforma (login/dashboard)
// - www.praticarapida.it  → sito marketing (Home)
// - localhost             → trattato come sito marketing in dev
const IS_APP_SUBDOMAIN = window.location.hostname.startsWith("app.");

function RootRoute() {
  if (IS_APP_SUBDOMAIN) {
    // Utenti su app.praticarapida.it → redirect diretto al pannello
    return <AuthRoute />;
  }
  // Tutti gli altri (www, praticarapida.it, localhost) → home marketing
  return <HomeMain />;
}

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
  const { session, loading, roles, isPasswordRecovery } = useAuth();
  if (loading) return null;
  // If user landed via a password-reset link, always show the Auth page (reset view)
  if (isPasswordRecovery) return <Auth />;
  if (session) {
    // Tutti i ruoli operativi atterrano su /kanban (pagina unificata Pipeline/Tabella)
    if (isStaff(roles)) return <Navigate to="/kanban" replace />;
    if (isResellerRole(roles)) return <Navigate to="/kanban" replace />;
    if (roles.some(r => ["admin_interno", "azienda_admin", "azienda_user"].includes(r))) {
      return <Navigate to="/kanban" replace />;
    }
    return <Navigate to="/auth" replace />;
  }
  return <Auth />;
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ErrorBoundary>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* ── Sito pubblico (www.praticarapida.it) ───────────────── */}
                <Route path="/" element={<RootRoute />} />
                <Route path="/pratica-enea" element={<Home />} />
                <Route path="/conto-termico" element={<HomeCT />} />
                <Route path="/offerta" element={<Navigate to="/pratica-enea" replace />} />
                <Route path="/home" element={<Navigate to="/" replace />} />
                <Route path="/area-riservata-vecchia" element={<AreaRiservataVecchia />} />
                <Route path="/area-riservata-vecchia/pratica-enea" element={<VecchioPraticaEnea />} />
                <Route path="/area-riservata-vecchia/fotovoltaico-off-grid" element={<VecchioFotovoltaicoOffGrid />} />
                <Route path="/area-riservata-vecchia/visura-catastale" element={<VecchioVisuraCatastale />} />
                <Route path="/area-riservata-vecchia/verifica-prezzi" element={<VecchioVerificaPrezzi />} />
                <Route path="/area-riservata-vecchia/allaccio-fotovoltaico" element={<VecchioAllaccioFotovoltaico />} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/cookie-policy" element={<CookiePolicy />} />
                <Route path="/faq" element={<FAQPage />} />
                <Route path="/blog" element={<BlogPage />} />
                <Route path="/blog/:slug" element={<BlogPostPage />} />
                <Route path="/auth" element={<AuthRoute />} />
                <Route path="/blocked" element={<Blocked />} />
                <Route path="/form/:token" element={<FormPubblico />} />
                <Route path="/schermature-solari/:token" element={<ModuloClientePage />} />
                <Route path="/modulo-infissi/:token" element={<ModuloClientePage />} />
                <Route path="/impianto-termico/:token" element={<ModuloClientePage />} />
                <Route path="/modulo-vepa/:token" element={<ModuloClientePage />} />
                <Route path="/onboarding" element={<Onboarding />} />
                {/* /admin (senza sottopath) → redirect al pannello appropriato */}
                <Route path="/admin" element={<ProtectedRoute><RootRedirect /></ProtectedRoute>} />
                <Route path="/pratiche" element={<ProtectedRoute><RoleGuard allowed={[...STAFF_ROLES, "admin_interno", "azienda_admin", "azienda_user"]} fallback="/kanban"><Pratiche /></RoleGuard></ProtectedRoute>} />
                <Route path="/pratiche/nuova" element={<ProtectedRoute><RoleGuard allowed={[...STAFF_ROLES, "admin_interno"]} fallback="/enea/nuova"><NuovaPratica /></RoleGuard></ProtectedRoute>} />
                <Route path="/pratiche/:id" element={<ProtectedRoute><RoleGuard allowed={[...STAFF_ROLES, "admin_interno", "azienda_admin", "azienda_user"]} fallback="/kanban"><PraticaDetail /></RoleGuard></ProtectedRoute>} />
                <Route path="/wallet" element={<ProtectedRoute><WalletPage /></ProtectedRoute>} />
                <Route path="/impostazioni" element={<ProtectedRoute><ImpostazioniAzienda /></ProtectedRoute>} />
                <Route path="/assistenza" element={<ProtectedRoute><Assistenza /></ProtectedRoute>} />
                <Route path="/clienti" element={<ProtectedRoute><Clienti /></ProtectedRoute>} />

                {/* Staff-only routes (super_admin + operatore — NOT admin_interno/company admins) */}
                <Route path="/aziende" element={<ProtectedRoute><RoleGuard allowed={[...STAFF_ROLES]}><Aziende /></RoleGuard></ProtectedRoute>} />
                <Route path="/aziende/:id" element={<ProtectedRoute><RoleGuard allowed={[...STAFF_ROLES]}><AziendaDetail /></RoleGuard></ProtectedRoute>} />
                {/* Redirect legacy standalone routes to Impostazioni tabs */}
                <Route path="/utenti" element={<Navigate to="/admin/impostazioni" replace />} />
                <Route path="/listino" element={<Navigate to="/admin/impostazioni" replace />} />
                <Route path="/admin/audit-log" element={<Navigate to="/admin/impostazioni" replace />} />
                <Route path="/coda-pratiche" element={<ProtectedRoute><RoleGuard allowed={[...STAFF_ROLES]}><CodaPratiche /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/pratiche" element={<ProtectedRoute><RoleGuard allowed={[...STAFF_ROLES]}><AdminPratiche /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/ticket" element={<ProtectedRoute><RoleGuard allowed={[...STAFF_ROLES]}><AdminTicket /></RoleGuard></ProtectedRoute>} />

                {/* Super admin only */}
                <Route path="/admin/impostazioni" element={<ProtectedRoute><RoleGuard allowed={[...ADMIN_ROLES]}><ImpostazioniPiattaforma /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/campi" element={<ProtectedRoute><RoleGuard allowed={[...ADMIN_ROLES]}><ImpostazioniCampi /></RoleGuard></ProtectedRoute>} />

                {/* Pratica Rapida v2.0 — ENEA/CT */}
                {/* /kanban + /enea/* open to staff + resellers + tenant admins */}
                <Route path="/kanban" element={<ProtectedRoute><RoleGuard allowed={[...STAFF_ROLES, ...RESELLER_ROLES, "admin_interno", "azienda_admin", "azienda_user"]}><KanbanBoard /></RoleGuard></ProtectedRoute>} />
                <Route path="/enea/nuova" element={<ProtectedRoute><RoleGuard allowed={[...STAFF_ROLES, ...RESELLER_ROLES, "admin_interno", "azienda_admin", "azienda_user"]}><NuovaPraticaEnea /></RoleGuard></ProtectedRoute>} />
                <Route path="/enea/dashboard" element={<ProtectedRoute><RoleGuard allowed={[...ALL_AUTH_ROLES]}><EneaDashboard /></RoleGuard></ProtectedRoute>} />
                <Route path="/enea/archivio" element={<ProtectedRoute><RoleGuard allowed={[...STAFF_ROLES, ...RESELLER_ROLES, "admin_interno", "azienda_admin", "azienda_user"]}><ArchivioEnea /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/gestionale" element={<Navigate to="/kanban" replace />} />
                <Route path="/admin/automazioni" element={<ProtectedRoute><RoleGuard allowed={[...STAFF_ROLES]}><Automazioni /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/comunicazioni" element={<ProtectedRoute><RoleGuard allowed={[...STAFF_ROLES]}><ComunicazioniLog /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/calendario" element={<ProtectedRoute><RoleGuard allowed={[...STAFF_ROLES]}><CalendarioChiamate /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/promo" element={<ProtectedRoute><RoleGuard allowed={[...STAFF_ROLES]}><PromoManager /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/news" element={<ProtectedRoute><RoleGuard allowed={[...STAFF_ROLES]}><AdminNews /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/clienti" element={<ProtectedRoute><RoleGuard allowed={[...STAFF_ROLES]}><ClientiAdmin /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/clienti/:id" element={<ProtectedRoute><RoleGuard allowed={[...STAFF_ROLES]}><ClienteDettaglio /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/email" element={<ProtectedRoute><RoleGuard allowed={[...STAFF_ROLES]}><EmailTemplates /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin/whatsapp" element={<ProtectedRoute><RoleGuard allowed={[...STAFF_ROLES]}><WhatsappPanel /></RoleGuard></ProtectedRoute>} />
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
