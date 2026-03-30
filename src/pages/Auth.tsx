import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileCheck, Zap, Shield, ArrowLeft, Eye, EyeOff } from "lucide-react";

type View = "login" | "forgot" | "reset";

const APP_URL = "https://app.praticarapida.it";

export default function Auth() {
  const [view, setView] = useState<View>("login");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Detect PASSWORD_RECOVERY event (user clicked the reset link in email)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setView("reset");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

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
    } else {
      navigate("/");
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
      toast({
        title: "Password aggiornata ✓",
        description: "Puoi ora accedere con la nuova password.",
      });
      setNewPassword("");
      setConfirmPassword("");
      navigate("/");
    }
  };

  const features = [
    { icon: <Zap size={18} />, text: "Pratiche ENEA in pochi click" },
    { icon: <FileCheck size={18} />, text: "Gestione documenti centralizzata" },
    { icon: <Shield size={18} />, text: "Dati sicuri e sempre aggiornati" },
  ];

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
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          background: "#ffffff",
        }}
      >
        <div style={{ width: "100%", maxWidth: "400px" }}>

          {view === "login" ? (
            <>
              <div style={{ marginBottom: "2.5rem" }}>
                <h2 style={{
                  fontSize: "1.875rem",
                  fontWeight: 800,
                  color: "#111827",
                  margin: "0 0 0.5rem",
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
                  <label htmlFor="email" style={{
                    display: "block", fontSize: "0.875rem", fontWeight: 600,
                    color: "#374151", marginBottom: "0.5rem",
                  }}>
                    Email
                  </label>
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
                    style={{
                      width: "100%", padding: "0.8125rem 1rem",
                      border: `1.5px solid ${focusedField === "email" ? "#16a34a" : "#e5e7eb"}`,
                      borderRadius: "0.875rem", fontSize: "0.9375rem",
                      outline: "none", background: focusedField === "email" ? "#f0fdf4" : "#f9fafb",
                      color: "#111827", boxSizing: "border-box",
                      transition: "border-color 0.15s, background 0.15s",
                      fontFamily: "inherit",
                    }}
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
                        textDecoration: "none",
                      }}
                    >
                      Password dimenticata?
                    </button>
                  </div>
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                    style={{
                      width: "100%", padding: "0.8125rem 1rem",
                      border: `1.5px solid ${focusedField === "password" ? "#16a34a" : "#e5e7eb"}`,
                      borderRadius: "0.875rem", fontSize: "0.9375rem",
                      outline: "none", background: focusedField === "password" ? "#f0fdf4" : "#f9fafb",
                      color: "#111827", boxSizing: "border-box",
                      transition: "border-color 0.15s, background 0.15s",
                      fontFamily: "inherit",
                    }}
                  />
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    marginTop: "0.25rem",
                    width: "100%", padding: "0.9375rem",
                    background: loading
                      ? "#d1d5db"
                      : "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
                    color: "#ffffff", border: "none",
                    borderRadius: "0.875rem", fontSize: "1rem", fontWeight: 700,
                    cursor: loading ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                    boxShadow: loading ? "none" : "0 4px 16px rgba(22,163,74,0.3)",
                    transition: "all 0.15s", fontFamily: "inherit",
                    letterSpacing: "0.01em",
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = "0 8px 24px rgba(22,163,74,0.4)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = loading ? "none" : "0 4px 16px rgba(22,163,74,0.3)";
                  }}
                >
                  {loading ? (
                    <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Accesso in corso…</>
                  ) : "Accedi →"}
                </button>
              </form>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setView("login")}
                style={{
                  display: "flex", alignItems: "center", gap: "0.375rem",
                  background: "none", border: "none",
                  color: "#6b7280", fontSize: "0.875rem",
                  cursor: "pointer", fontFamily: "inherit",
                  padding: 0, marginBottom: "2rem",
                  fontWeight: 500,
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
                  <label htmlFor="forgot-email" style={{
                    display: "block", fontSize: "0.875rem", fontWeight: 600,
                    color: "#374151", marginBottom: "0.5rem",
                  }}>
                    Email
                  </label>
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
                    style={{
                      width: "100%", padding: "0.8125rem 1rem",
                      border: `1.5px solid ${focusedField === "forgot-email" ? "#16a34a" : "#e5e7eb"}`,
                      borderRadius: "0.875rem", fontSize: "0.9375rem",
                      outline: "none", background: focusedField === "forgot-email" ? "#f0fdf4" : "#f9fafb",
                      color: "#111827", boxSizing: "border-box",
                      transition: "border-color 0.15s, background 0.15s",
                      fontFamily: "inherit",
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: "100%", padding: "0.9375rem",
                    background: loading
                      ? "#d1d5db"
                      : "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
                    color: "#ffffff", border: "none",
                    borderRadius: "0.875rem", fontSize: "1rem", fontWeight: 700,
                    cursor: loading ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                    boxShadow: loading ? "none" : "0 4px 16px rgba(22,163,74,0.3)",
                    transition: "all 0.15s", fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = "0 8px 24px rgba(22,163,74,0.4)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = loading ? "none" : "0 4px 16px rgba(22,163,74,0.3)";
                  }}
                >
                  {loading ? (
                    <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Invio in corso…</>
                  ) : "Invia link di recupero →"}
                </button>
              </form>
            </>
          ) : view === "reset" ? (
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
                  <label htmlFor="new-password" style={{
                    display: "block", fontSize: "0.875rem", fontWeight: 600,
                    color: "#374151", marginBottom: "0.5rem",
                  }}>
                    Nuova password
                  </label>
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
                      style={{
                        width: "100%", padding: "0.8125rem 3rem 0.8125rem 1rem",
                        border: `1.5px solid ${focusedField === "new-password" ? "#16a34a" : "#e5e7eb"}`,
                        borderRadius: "0.875rem", fontSize: "0.9375rem",
                        outline: "none", background: focusedField === "new-password" ? "#f0fdf4" : "#f9fafb",
                        color: "#111827", boxSizing: "border-box",
                        transition: "border-color 0.15s, background 0.15s",
                        fontFamily: "inherit",
                      }}
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
                  {/* Strength hint */}
                  {newPassword.length > 0 && (
                    <p style={{
                      fontSize: "0.75rem", marginTop: "0.375rem",
                      color: newPassword.length < 8 ? "#ef4444" : newPassword.length < 12 ? "#f59e0b" : "#16a34a",
                    }}>
                      {newPassword.length < 8 ? "Troppo corta (min. 8 caratteri)" : newPassword.length < 12 ? "Accettabile — più lunga è meglio" : "Ottima ✓"}
                    </p>
                  )}
                </div>

                {/* Confirm password */}
                <div>
                  <label htmlFor="confirm-password" style={{
                    display: "block", fontSize: "0.875rem", fontWeight: 600,
                    color: "#374151", marginBottom: "0.5rem",
                  }}>
                    Conferma password
                  </label>
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
                        width: "100%", padding: "0.8125rem 3rem 0.8125rem 1rem",
                        border: `1.5px solid ${
                          confirmPassword.length > 0 && confirmPassword !== newPassword
                            ? "#ef4444"
                            : focusedField === "confirm-password" ? "#16a34a" : "#e5e7eb"
                        }`,
                        borderRadius: "0.875rem", fontSize: "0.9375rem",
                        outline: "none",
                        background: focusedField === "confirm-password" ? "#f0fdf4" : "#f9fafb",
                        color: "#111827", boxSizing: "border-box",
                        transition: "border-color 0.15s, background 0.15s",
                        fontFamily: "inherit",
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

                <button
                  type="submit"
                  disabled={loading || newPassword.length < 8 || newPassword !== confirmPassword}
                  style={{
                    marginTop: "0.25rem",
                    width: "100%", padding: "0.9375rem",
                    background: (loading || newPassword.length < 8 || newPassword !== confirmPassword)
                      ? "#d1d5db"
                      : "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
                    color: "#ffffff", border: "none",
                    borderRadius: "0.875rem", fontSize: "1rem", fontWeight: 700,
                    cursor: (loading || newPassword.length < 8 || newPassword !== confirmPassword) ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                    boxShadow: (loading || newPassword.length < 8 || newPassword !== confirmPassword) ? "none" : "0 4px 16px rgba(22,163,74,0.3)",
                    transition: "all 0.15s", fontFamily: "inherit",
                    letterSpacing: "0.01em",
                  }}
                  onMouseEnter={(e) => {
                    if (!loading && newPassword.length >= 8 && newPassword === confirmPassword) {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = "0 8px 24px rgba(22,163,74,0.4)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = (loading || newPassword.length < 8 || newPassword !== confirmPassword)
                      ? "none" : "0 4px 16px rgba(22,163,74,0.3)";
                  }}
                >
                  {loading ? (
                    <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Aggiornamento…</>
                  ) : "Salva nuova password →"}
                </button>
              </form>
            </>
          ) : null}

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
