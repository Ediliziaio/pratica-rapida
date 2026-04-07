import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileCheck, Zap, Shield, ArrowLeft, Eye, EyeOff } from "lucide-react";

type View = "login" | "forgot" | "register" | "reset";

const APP_URL = "https://app.praticarapida.it";

export default function Auth() {
  const [view, setView] = useState<View>("login");
  const [loading, setLoading] = useState(false);

  // Login / forgot fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Reset fields
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Register fields
  const [regNome, setRegNome] = useState("");
  const [regCognome, setRegCognome] = useState("");
  const [regRagioneSociale, setRegRagioneSociale] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPiva, setRegPiva] = useState("");
  const [regTelefono, setRegTelefono] = useState("");
  const [regIndirizzo, setRegIndirizzo] = useState("");
  const [regCitta, setRegCitta] = useState("");
  const [regCap, setRegCap] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);

  const [focusedField, setFocusedField] = useState<string | null>(null);

  const { isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const { toast } = useToast();
  // Derived active view — recovery takes priority
  const activeView = isPasswordRecovery ? "reset" : view;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast({
        title: "Credenziali non valide",
        description: "Email o password errati. Riprova.",
        variant: "destructive",
      });
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${APP_URL}/auth`,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Email inviata ✓",
        description: "Controlla la tua casella di posta per reimpostare la password.",
      });
      setView("login");
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({ title: "Password troppo corta", description: "Minimo 8 caratteri.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Le password non coincidono", description: "Ricontrolla i campi.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password aggiornata ✓", description: "Puoi ora accedere con la nuova password." });
      clearPasswordRecovery();
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/register-company`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            nome: regNome,
            cognome: regCognome,
            ragione_sociale: regRagioneSociale,
            email: regEmail,
            password: regPassword,
            piva: regPiva,
            telefono: regTelefono,
            indirizzo: regIndirizzo,
            citta: regCitta,
            cap: regCap,
            provincia: "",
            settore: "",
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Errore registrazione", description: data.error ?? "Errore sconosciuto.", variant: "destructive" });
        setLoading(false);
        return;
      }
      toast({ title: "Registrazione completata! Controlla la tua email.", description: "Accesso in corso…" });
      // Auto-login
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: regEmail,
        password: regPassword,
      });
      setLoading(false);
      if (loginErr) {
        toast({ title: "Registrazione ok", description: "Accedi con le tue credenziali.", variant: "destructive" });
        setView("login");
      }
    } catch (err: unknown) {
      setLoading(false);
      toast({ title: "Errore di rete", description: String(err), variant: "destructive" });
    }
  };

  // ── Reusable style helpers ─────────────────────────────────────────────────

  const inputStyle = (fieldKey: string, extra?: React.CSSProperties): React.CSSProperties => ({
    width: "100%",
    padding: "0.8125rem 1rem",
    border: `1.5px solid ${focusedField === fieldKey ? "#16a34a" : "#e5e7eb"}`,
    borderRadius: "0.875rem",
    fontSize: "0.9375rem",
    outline: "none",
    background: focusedField === fieldKey ? "#f0fdf4" : "#f9fafb",
    color: "#111827",
    boxSizing: "border-box",
    transition: "border-color 0.15s, background 0.15s",
    fontFamily: "inherit",
    ...extra,
  });

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "#374151",
    marginBottom: "0.5rem",
  };

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    marginTop: "0.25rem",
    width: "100%",
    padding: "0.9375rem",
    background: disabled
      ? "#d1d5db"
      : "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
    color: "#ffffff",
    border: "none",
    borderRadius: "0.875rem",
    fontSize: "1rem",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    boxShadow: disabled ? "none" : "0 4px 16px rgba(22,163,74,0.3)",
    transition: "all 0.15s",
    fontFamily: "inherit",
    letterSpacing: "0.01em",
  });

  const btnHoverOn = (e: React.MouseEvent<HTMLButtonElement>, disabled: boolean) => {
    if (!disabled) {
      e.currentTarget.style.transform = "translateY(-2px)";
      e.currentTarget.style.boxShadow = "0 8px 24px rgba(22,163,74,0.4)";
    }
  };
  const btnHoverOff = (e: React.MouseEvent<HTMLButtonElement>, disabled: boolean) => {
    e.currentTarget.style.transform = "translateY(0)";
    e.currentTarget.style.boxShadow = disabled ? "none" : "0 4px 16px rgba(22,163,74,0.3)";
  };

  // ── Features list (left panel) ─────────────────────────────────────────────

  const features = [
    { icon: <Zap size={18} />, text: "Pratiche ENEA in pochi click" },
    { icon: <FileCheck size={18} />, text: "Gestione documenti centralizzata" },
    { icon: <Shield size={18} />, text: "Dati sicuri e sempre aggiornati" },
  ];

  // ── Tab bar (login / register) ─────────────────────────────────────────────

  const TabBar = () => (
    <div style={{
      display: "flex",
      gap: "0.375rem",
      background: "#f3f4f6",
      borderRadius: "0.875rem",
      padding: "0.25rem",
      marginBottom: "2rem",
    }}>
      {(["login", "register"] as View[]).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => setView(v)}
          style={{
            flex: 1,
            padding: "0.625rem 0",
            border: "none",
            borderRadius: "0.625rem",
            fontSize: "0.9rem",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "all 0.15s",
            background: view === v ? "#16a34a" : "transparent",
            color: view === v ? "#ffffff" : "#6b7280",
            boxShadow: view === v ? "0 2px 8px rgba(22,163,74,0.25)" : "none",
          }}
        >
          {v === "login" ? "Accedi" : "Registrati"}
        </button>
      ))}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        fontFamily: "'Inter', 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
        background: "#ffffff",
      }}
    >
      {/* ── LEFT PANEL ── */}
      <div
        style={{
          flex: "0 0 50%",
          background: "linear-gradient(160deg, #14532d 0%, #166534 40%, #15803d 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "3rem",
          position: "relative",
          overflow: "hidden",
        }}
        className="auth-left-panel"
      >
        {/* Decorative circles */}
        <div style={{
          position: "absolute", width: "400px", height: "400px",
          borderRadius: "50%", background: "rgba(255,255,255,0.04)",
          top: "-100px", right: "-100px", pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", width: "300px", height: "300px",
          borderRadius: "50%", background: "rgba(255,255,255,0.04)",
          bottom: "60px", left: "-80px", pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", width: "180px", height: "180px",
          borderRadius: "50%", background: "rgba(255,255,255,0.05)",
          bottom: "200px", right: "60px", pointerEvents: "none",
        }} />

        {/* Logo */}
        <div style={{ position: "relative" }}>
          <img
            src="/pratica-rapida-logo.png"
            alt="Pratica Rapida"
            style={{ width: "170px", filter: "brightness(0) invert(1)" }}
          />
        </div>

        {/* Center content */}
        <div style={{ position: "relative" }}>
          <div style={{
            display: "inline-block",
            background: "rgba(255,255,255,0.15)",
            borderRadius: "2rem",
            padding: "0.35rem 0.9rem",
            marginBottom: "1.25rem",
          }}>
            <span style={{ color: "#bbf7d0", fontSize: "0.8rem", fontWeight: 600, letterSpacing: "0.05em" }}>
              PIATTAFORMA CERTIFICATA
            </span>
          </div>

          <h1 style={{
            color: "#ffffff",
            fontSize: "clamp(1.75rem, 3vw, 2.5rem)",
            fontWeight: 800,
            lineHeight: 1.2,
            margin: "0 0 1rem",
            letterSpacing: "-0.02em",
          }}>
            Pratiche ENEA<br />e Conto Termico<br />
            <span style={{ color: "#86efac" }}>semplificate.</span>
          </h1>

          <p style={{
            color: "#bbf7d0",
            fontSize: "1rem",
            lineHeight: 1.6,
            margin: "0 0 2rem",
            opacity: 0.9,
          }}>
            Gestisci l'intero flusso documentale in un'unica piattaforma,
            coordinando aziende e professionisti abilitati.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            {features.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{
                  width: "36px", height: "36px",
                  borderRadius: "0.625rem",
                  background: "rgba(255,255,255,0.12)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#86efac", flexShrink: 0,
                }}>
                  {f.icon}
                </div>
                <span style={{ color: "#dcfce7", fontSize: "0.9375rem", fontWeight: 500 }}>
                  {f.text}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.75rem", position: "relative" }}>
          © {new Date().getFullYear()} Pratica Rapida. Tutti i diritti riservati.
        </p>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: activeView === "register" ? "flex-start" : "center",
          justifyContent: "center",
          padding: "2rem",
          background: "#ffffff",
          overflowY: "auto",
        }}
      >
        <div style={{
          width: "100%",
          maxWidth: activeView === "register" ? "440px" : "400px",
          paddingTop: activeView === "register" ? "2rem" : 0,
          paddingBottom: activeView === "register" ? "2rem" : 0,
        }}>

          {/* ── Tab bar (login + register only) ── */}
          {(activeView === "login" || activeView === "register") && <TabBar />}

          {/* ══════════════════════════════════════════
              LOGIN VIEW
          ══════════════════════════════════════════ */}
          {activeView === "login" && (
            <>
              <div style={{ marginBottom: "2.5rem" }}>
                <h2 style={{
                  fontSize: "1.875rem", fontWeight: 800,
                  color: "#111827", margin: "0 0 0.5rem",
                  letterSpacing: "-0.025em",
                }}>
                  Bentornato 👋
                </h2>
                <p style={{ color: "#6b7280", fontSize: "0.9375rem", margin: 0 }}>
                  Accedi al tuo account per continuare
                </p>
              </div>

              <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "1.375rem" }}>
                {/* Email */}
                <div>
                  <label htmlFor="email" style={labelStyle}>Email</label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="mario@esempio.it"
                    onFocus={() => setFocusedField("email")}
                    onBlur={() => setFocusedField(null)}
                    style={inputStyle("email")}
                  />
                </div>

                {/* Password */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <label htmlFor="password" style={{ fontSize: "0.875rem", fontWeight: 600, color: "#374151" }}>
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setView("forgot")}
                      style={{
                        background: "none", border: "none",
                        color: "#16a34a", fontSize: "0.8125rem",
                        cursor: "pointer", fontWeight: 600,
                        padding: 0, fontFamily: "inherit",
                      }}
                    >
                      Password dimenticata?
                    </button>
                  </div>
                  <div style={{ position: "relative" }}>
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      onFocus={() => setFocusedField("password")}
                      onBlur={() => setFocusedField(null)}
                      style={inputStyle("password", { paddingRight: "3rem" })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: "absolute", right: "0.875rem", top: "50%",
                        transform: "translateY(-50%)", background: "none", border: "none",
                        cursor: "pointer", color: "#9ca3af", padding: 0,
                        display: "flex", alignItems: "center",
                      }}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={btnStyle(loading)}
                  onMouseEnter={(e) => btnHoverOn(e, loading)}
                  onMouseLeave={(e) => btnHoverOff(e, loading)}
                >
                  {loading
                    ? <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Accesso in corso…</>
                    : "Accedi →"}
                </button>
              </form>
            </>
          )}

          {/* ══════════════════════════════════════════
              FORGOT VIEW
          ══════════════════════════════════════════ */}
          {activeView === "forgot" && (
            <>
              <button
                type="button"
                onClick={() => setView("login")}
                style={{
                  display: "flex", alignItems: "center", gap: "0.375rem",
                  background: "none", border: "none",
                  color: "#6b7280", fontSize: "0.875rem",
                  cursor: "pointer", fontFamily: "inherit",
                  padding: 0, marginBottom: "2rem", fontWeight: 500,
                }}
              >
                <ArrowLeft size={16} /> Torna al login
              </button>

              <div style={{ marginBottom: "2.5rem" }}>
                <h2 style={{
                  fontSize: "1.875rem", fontWeight: 800,
                  color: "#111827", margin: "0 0 0.5rem",
                  letterSpacing: "-0.025em",
                }}>
                  Recupera password
                </h2>
                <p style={{ color: "#6b7280", fontSize: "0.9375rem", margin: 0 }}>
                  Inserisci la tua email e ti invieremo un link per reimpostare la password
                </p>
              </div>

              <form onSubmit={handleForgot} style={{ display: "flex", flexDirection: "column", gap: "1.375rem" }}>
                <div>
                  <label htmlFor="forgot-email" style={labelStyle}>Email</label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="mario@esempio.it"
                    onFocus={() => setFocusedField("forgot-email")}
                    onBlur={() => setFocusedField(null)}
                    style={inputStyle("forgot-email")}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={btnStyle(loading)}
                  onMouseEnter={(e) => btnHoverOn(e, loading)}
                  onMouseLeave={(e) => btnHoverOff(e, loading)}
                >
                  {loading
                    ? <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Invio in corso…</>
                    : "Invia link di recupero →"}
                </button>
              </form>
            </>
          )}

          {/* ══════════════════════════════════════════
              RESET VIEW
          ══════════════════════════════════════════ */}
          {activeView === "reset" && (
            <>
              <div style={{ marginBottom: "2.5rem" }}>
                <h2 style={{
                  fontSize: "1.875rem", fontWeight: 800,
                  color: "#111827", margin: "0 0 0.5rem",
                  letterSpacing: "-0.025em",
                }}>
                  Nuova password 🔑
                </h2>
                <p style={{ color: "#6b7280", fontSize: "0.9375rem", margin: 0 }}>
                  Scegli una nuova password sicura per il tuo account
                </p>
              </div>

              <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: "1.375rem" }}>
                {/* New password */}
                <div>
                  <label htmlFor="new-password" style={labelStyle}>Nuova password</label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="new-password"
                      type={showNew ? "text" : "password"}
                      required
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimo 8 caratteri"
                      onFocus={() => setFocusedField("new-password")}
                      onBlur={() => setFocusedField(null)}
                      style={inputStyle("new-password", { paddingRight: "3rem" })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(!showNew)}
                      style={{
                        position: "absolute", right: "0.875rem", top: "50%",
                        transform: "translateY(-50%)", background: "none", border: "none",
                        cursor: "pointer", color: "#9ca3af", padding: 0,
                        display: "flex", alignItems: "center",
                      }}
                    >
                      {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {newPassword.length > 0 && (
                    <p style={{
                      fontSize: "0.75rem", marginTop: "0.375rem",
                      color: newPassword.length < 8 ? "#ef4444" : newPassword.length < 12 ? "#f59e0b" : "#16a34a",
                    }}>
                      {newPassword.length < 8
                        ? "Troppo corta (min. 8 caratteri)"
                        : newPassword.length < 12
                        ? "Accettabile — più lunga è meglio"
                        : "Ottima ✓"}
                    </p>
                  )}
                </div>

                {/* Confirm password */}
                <div>
                  <label htmlFor="confirm-password" style={labelStyle}>Conferma password</label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="confirm-password"
                      type={showConfirm ? "text" : "password"}
                      required
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Ripeti la password"
                      onFocus={() => setFocusedField("confirm-password")}
                      onBlur={() => setFocusedField(null)}
                      style={{
                        ...inputStyle("confirm-password", { paddingRight: "3rem" }),
                        border: `1.5px solid ${
                          confirmPassword.length > 0 && confirmPassword !== newPassword
                            ? "#ef4444"
                            : focusedField === "confirm-password" ? "#16a34a" : "#e5e7eb"
                        }`,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      style={{
                        position: "absolute", right: "0.875rem", top: "50%",
                        transform: "translateY(-50%)", background: "none", border: "none",
                        cursor: "pointer", color: "#9ca3af", padding: 0,
                        display: "flex", alignItems: "center",
                      }}
                    >
                      {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                    <p style={{ fontSize: "0.75rem", marginTop: "0.375rem", color: "#ef4444" }}>
                      Le password non coincidono
                    </p>
                  )}
                </div>

                {(() => {
                  const disabled = loading || newPassword.length < 8 || newPassword !== confirmPassword;
                  return (
                    <button
                      type="submit"
                      disabled={disabled}
                      style={btnStyle(disabled)}
                      onMouseEnter={(e) => btnHoverOn(e, disabled)}
                      onMouseLeave={(e) => btnHoverOff(e, disabled)}
                    >
                      {loading
                        ? <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Aggiornamento…</>
                        : "Salva nuova password →"}
                    </button>
                  );
                })()}
              </form>
            </>
          )}

          {/* ══════════════════════════════════════════
              REGISTER VIEW
          ══════════════════════════════════════════ */}
          {activeView === "register" && (
            <>
              <div style={{ marginBottom: "2rem" }}>
                <h2 style={{
                  fontSize: "1.75rem", fontWeight: 800,
                  color: "#111827", margin: "0 0 0.375rem",
                  letterSpacing: "-0.025em",
                }}>
                  Crea il tuo account 🏢
                </h2>
                <p style={{ color: "#6b7280", fontSize: "0.9375rem", margin: 0 }}>
                  Inizia gratis. Nessun impegno.
                </p>
              </div>

              <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

                {/* Row 0: Nome + Cognome */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label htmlFor="reg-nome" style={labelStyle}>
                      Nome <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      id="reg-nome"
                      type="text"
                      required
                      autoComplete="given-name"
                      value={regNome}
                      onChange={(e) => setRegNome(e.target.value)}
                      placeholder="Mario"
                      onFocus={() => setFocusedField("reg-nome")}
                      onBlur={() => setFocusedField(null)}
                      style={inputStyle("reg-nome")}
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-cognome" style={labelStyle}>
                      Cognome <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      id="reg-cognome"
                      type="text"
                      required
                      autoComplete="family-name"
                      value={regCognome}
                      onChange={(e) => setRegCognome(e.target.value)}
                      placeholder="Rossi"
                      onFocus={() => setFocusedField("reg-cognome")}
                      onBlur={() => setFocusedField(null)}
                      style={inputStyle("reg-cognome")}
                    />
                  </div>
                </div>

                {/* Row 1: Ragione Sociale (full width) */}
                <div>
                  <label htmlFor="reg-ragione-sociale" style={labelStyle}>
                    Ragione Sociale <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    id="reg-ragione-sociale"
                    type="text"
                    required
                    autoComplete="organization"
                    value={regRagioneSociale}
                    onChange={(e) => setRegRagioneSociale(e.target.value)}
                    placeholder="Edilizia Rossi S.r.l."
                    onFocus={() => setFocusedField("reg-ragione-sociale")}
                    onBlur={() => setFocusedField(null)}
                    style={inputStyle("reg-ragione-sociale")}
                  />
                </div>

                {/* Row 2: P.IVA + Telefono */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label htmlFor="reg-piva" style={labelStyle}>
                      P.IVA <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      id="reg-piva"
                      type="text"
                      required
                      value={regPiva}
                      onChange={(e) => setRegPiva(e.target.value)}
                      placeholder="12345678901"
                      onFocus={() => setFocusedField("reg-piva")}
                      onBlur={() => setFocusedField(null)}
                      style={inputStyle("reg-piva")}
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-telefono" style={labelStyle}>
                      Telefono <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      id="reg-telefono"
                      type="tel"
                      required
                      value={regTelefono}
                      onChange={(e) => setRegTelefono(e.target.value)}
                      placeholder="+39 02 1234567"
                      onFocus={() => setFocusedField("reg-telefono")}
                      onBlur={() => setFocusedField(null)}
                      style={inputStyle("reg-telefono")}
                    />
                  </div>
                </div>

                {/* Row 3: Email (full width) */}
                <div>
                  <label htmlFor="reg-email" style={labelStyle}>
                    Email <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="mario@azienda.it"
                    onFocus={() => setFocusedField("reg-email")}
                    onBlur={() => setFocusedField(null)}
                    style={inputStyle("reg-email")}
                  />
                </div>

                {/* Row 4: Password (full width) */}
                <div>
                  <label htmlFor="reg-password" style={labelStyle}>
                    Password <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="reg-password"
                      type={showRegPassword ? "text" : "password"}
                      required
                      autoComplete="new-password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Minimo 8 caratteri"
                      onFocus={() => setFocusedField("reg-password")}
                      onBlur={() => setFocusedField(null)}
                      style={inputStyle("reg-password", { paddingRight: "3rem" })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      style={{
                        position: "absolute", right: "0.875rem", top: "50%",
                        transform: "translateY(-50%)", background: "none", border: "none",
                        cursor: "pointer", color: "#9ca3af", padding: 0,
                        display: "flex", alignItems: "center",
                      }}
                    >
                      {showRegPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Row 5: Indirizzo (full width, optional) */}
                <div>
                  <label htmlFor="reg-indirizzo" style={labelStyle}>Indirizzo</label>
                  <input
                    id="reg-indirizzo"
                    type="text"
                    value={regIndirizzo}
                    onChange={(e) => setRegIndirizzo(e.target.value)}
                    placeholder="Via Roma 1"
                    onFocus={() => setFocusedField("reg-indirizzo")}
                    onBlur={() => setFocusedField(null)}
                    style={inputStyle("reg-indirizzo")}
                  />
                </div>

                {/* Row 6: Città (2/3) + CAP (1/3) */}
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label htmlFor="reg-citta" style={labelStyle}>Città</label>
                    <input
                      id="reg-citta"
                      type="text"
                      value={regCitta}
                      onChange={(e) => setRegCitta(e.target.value)}
                      placeholder="Milano"
                      onFocus={() => setFocusedField("reg-citta")}
                      onBlur={() => setFocusedField(null)}
                      style={inputStyle("reg-citta")}
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-cap" style={labelStyle}>CAP</label>
                    <input
                      id="reg-cap"
                      type="text"
                      value={regCap}
                      onChange={(e) => setRegCap(e.target.value)}
                      placeholder="20121"
                      onFocus={() => setFocusedField("reg-cap")}
                      onBlur={() => setFocusedField(null)}
                      style={inputStyle("reg-cap")}
                    />
                  </div>
                </div>

                {/* Info box */}
                <div style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "0.75rem",
                  padding: "0.875rem 1rem",
                  fontSize: "0.8125rem",
                  color: "#1e40af",
                  lineHeight: 1.5,
                }}>
                  📋 I tuoi dati verranno verificati dal nostro team. Riceverai un'email di conferma.
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  style={btnStyle(loading)}
                  onMouseEnter={(e) => btnHoverOn(e, loading)}
                  onMouseLeave={(e) => btnHoverOff(e, loading)}
                >
                  {loading
                    ? <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Creazione account…</>
                    : "Crea account →"}
                </button>

                {/* Privacy note */}
                <p style={{
                  fontSize: "0.75rem", color: "#9ca3af",
                  textAlign: "center", margin: "0.25rem 0 0",
                  lineHeight: 1.5,
                }}>
                  Registrandoti accetti i nostri{" "}
                  <a href="#" style={{ color: "#16a34a", textDecoration: "none" }}>Termini di Servizio</a>
                  {" "}e la{" "}
                  <a href="#" style={{ color: "#16a34a", textDecoration: "none" }}>Privacy Policy</a>
                </p>
              </form>
            </>
          )}

          {/* Footer */}
          <p style={{
            color: "#d1d5db", fontSize: "0.75rem",
            textAlign: "center", marginTop: "3rem", lineHeight: 1.6,
          }}>
            © {new Date().getFullYear()} Pratica Rapida · Tutti i diritti riservati
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (max-width: 768px) {
          .auth-left-panel { display: none !important; }
        }
      `}</style>
    </div>
  );
}
