import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

type View = "login" | "forgot";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.8rem 1rem",
  border: "1.5px solid #e5e7eb",
  borderRadius: "0.75rem",
  fontSize: "0.9375rem",
  outline: "none",
  background: "#f9fafb",
  color: "#111827",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "#374151",
  marginBottom: "0.375rem",
  letterSpacing: "0.01em",
};

const btnPrimary = (disabled: boolean): React.CSSProperties => ({
  width: "100%",
  padding: "0.9rem",
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
  transition: "transform 0.1s, box-shadow 0.1s",
  boxShadow: disabled ? "none" : "0 4px 14px rgba(22,163,74,0.35)",
  fontFamily: "inherit",
  letterSpacing: "0.01em",
});

export default function Auth() {
  const [view, setView] = useState<View>("login");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

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
      redirectTo: `${window.location.origin}/auth`,
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

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(150deg, #f0fdf4 0%, #dcfce7 40%, #f0fdf4 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        fontFamily:
          "'Inter', 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: "420px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <img
            src="/pratica-rapida-logo.png"
            alt="Pratica Rapida"
            style={{ width: "190px", margin: "0 auto 1rem", display: "block" }}
          />
          <p style={{ color: "#6b7280", fontSize: "0.875rem", margin: 0 }}>
            Pratiche ENEA e Conto Termico, semplici e veloci
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "1.75rem",
            boxShadow:
              "0 8px 40px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)",
            padding: "2.5rem 2.5rem 2rem",
          }}
        >
          {view === "login" ? (
            <>
              <div style={{ marginBottom: "2rem" }}>
                <h2
                  style={{
                    fontSize: "1.625rem",
                    fontWeight: 800,
                    color: "#111827",
                    margin: "0 0 0.375rem",
                    letterSpacing: "-0.02em",
                  }}
                >
                  Bentornato 👋
                </h2>
                <p style={{ color: "#6b7280", fontSize: "0.875rem", margin: 0 }}>
                  Accedi al tuo account per continuare
                </p>
              </div>

              <form
                onSubmit={handleLogin}
                style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
              >
                <div>
                  <label htmlFor="email" style={labelStyle}>
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="mario@esempio.it"
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = "#16a34a")}
                    onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                  />
                </div>

                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.375rem",
                    }}
                  >
                    <label htmlFor="password" style={{ ...labelStyle, marginBottom: 0 }}>
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setView("forgot")}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#16a34a",
                        fontSize: "0.8125rem",
                        cursor: "pointer",
                        fontWeight: 600,
                        padding: 0,
                        fontFamily: "inherit",
                      }}
                    >
                      Password dimenticata?
                    </button>
                  </div>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = "#16a34a")}
                    onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={btnPrimary(loading)}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
                      (e.currentTarget as HTMLButtonElement).style.boxShadow =
                        "0 6px 20px rgba(22,163,74,0.45)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                    (e.currentTarget as HTMLButtonElement).style.boxShadow =
                      "0 4px 14px rgba(22,163,74,0.35)";
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                      Accesso in corso…
                    </>
                  ) : (
                    "Accedi"
                  )}
                </button>
              </form>
            </>
          ) : (
            <>
              <div style={{ marginBottom: "2rem" }}>
                <h2
                  style={{
                    fontSize: "1.625rem",
                    fontWeight: 800,
                    color: "#111827",
                    margin: "0 0 0.375rem",
                    letterSpacing: "-0.02em",
                  }}
                >
                  Recupera password
                </h2>
                <p style={{ color: "#6b7280", fontSize: "0.875rem", margin: 0 }}>
                  Ti invieremo un link per reimpostare la password
                </p>
              </div>

              <form
                onSubmit={handleForgot}
                style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
              >
                <div>
                  <label htmlFor="forgot-email" style={labelStyle}>
                    Email
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="mario@esempio.it"
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = "#16a34a")}
                    onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={btnPrimary(loading)}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
                      (e.currentTarget as HTMLButtonElement).style.boxShadow =
                        "0 6px 20px rgba(22,163,74,0.45)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                    (e.currentTarget as HTMLButtonElement).style.boxShadow =
                      "0 4px 14px rgba(22,163,74,0.35)";
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                      Invio in corso…
                    </>
                  ) : (
                    "Invia link di recupero"
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setView("login")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#6b7280",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    textAlign: "center",
                    fontFamily: "inherit",
                    padding: "0.25rem",
                  }}
                >
                  ← Torna al login
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <p
          style={{
            textAlign: "center",
            color: "#9ca3af",
            fontSize: "0.75rem",
            marginTop: "1.75rem",
            lineHeight: 1.6,
          }}
        >
          Pratica Rapida gestisce le pratiche ENEA e Conto Termico per conto delle
          aziende,
          <br />
          coordinando le attività con professionisti abilitati.
        </p>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
