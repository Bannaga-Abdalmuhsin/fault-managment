import { useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Props { onSuccess: () => void; }

export default function Login({ onSuccess }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setError("Invalid email or password. Please try again.");
        return;
      }
      const { token } = await res.json() as { token: string };
      sessionStorage.setItem("cow_token", token);
      onSuccess();
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "stretch",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Full-page background image */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "url(/login-bg.png)",
        backgroundSize: "contain",
        backgroundPosition: "right center",
        backgroundRepeat: "no-repeat",
        backgroundColor: "#0a011a",
      }} />

      {/* Gradient overlay — heavier on left, fades right */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(100deg, rgba(15,3,30,0.97) 0%, rgba(25,5,50,0.92) 28%, rgba(30,5,60,0.70) 52%, rgba(20,0,40,0.25) 75%, transparent 100%)",
      }} />

      {/* Left panel — card column */}
      <div style={{
        position: "relative", zIndex: 2,
        display: "flex", flexDirection: "column",
        justifyContent: "center", alignItems: "flex-start",
        padding: "48px 56px",
        minWidth: 480, maxWidth: 520,
      }}>
        {/* Card */}
        <div style={{
          width: "100%", padding: "40px 38px 36px",
          background: "rgba(55,0,90,0.78)", backdropFilter: "blur(28px)",
          border: "1px solid rgba(200,140,255,0.28)", borderRadius: 20,
          boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(200,140,255,0.08)",
        }}>
          {/* ACES logo */}
          <div style={{ marginBottom: 34 }}>
            <img src="/aces-logo-login.png" alt="ACES Managed Services"
              style={{ height: 130, objectFit: "contain", marginLeft: -10,
                mixBlendMode: "screen" }} />
          </div>

          {/* Title */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "0.02em" }}>
              COW HAJJ 1447
            </div>
            <div style={{ fontSize: 12, color: "rgba(200,140,255,0.75)", marginTop: 5, fontWeight: 500 }}>
              Monitoring Dashboard — Secure Access
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(200,140,255,0.18)", marginBottom: 26 }} />

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(200,140,255,0.85)",
                letterSpacing: "0.07em", textTransform: "uppercase", display: "block", marginBottom: 7 }}>
                Email Address
              </label>
              <input
                type="email"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="user@example.com"
                autoComplete="username"
                required
                style={{
                  width: "100%", padding: "12px 14px", boxSizing: "border-box",
                  background: "rgba(255,255,255,0.07)", border: "1px solid rgba(200,140,255,0.25)",
                  borderRadius: 10, color: "#fff", fontSize: 14, outline: "none",
                  transition: "border-color 0.2s",
                }}
                onFocus={e => e.target.style.borderColor = "rgba(200,140,255,0.7)"}
                onBlur={e => e.target.style.borderColor = "rgba(200,140,255,0.25)"}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(200,140,255,0.85)",
                letterSpacing: "0.07em", textTransform: "uppercase", display: "block", marginBottom: 7 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                style={{
                  width: "100%", padding: "12px 14px", boxSizing: "border-box",
                  background: "rgba(255,255,255,0.07)", border: "1px solid rgba(200,140,255,0.25)",
                  borderRadius: 10, color: "#fff", fontSize: 14, outline: "none",
                  transition: "border-color 0.2s",
                }}
                onFocus={e => e.target.style.borderColor = "rgba(200,140,255,0.7)"}
                onBlur={e => e.target.style.borderColor = "rgba(200,140,255,0.25)"}
              />
            </div>

            {error && (
              <div style={{
                background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)",
                borderRadius: 8, padding: "9px 12px", fontSize: 12,
                color: "#FCA5A5", fontWeight: 500,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4, padding: "13px", borderRadius: 10, border: "none",
                background: loading
                  ? "rgba(78,0,142,0.5)"
                  : "linear-gradient(135deg, #4E008E, #7B1AC0)",
                color: "#fff", fontSize: 14, fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: loading ? "none" : "0 4px 20px rgba(78,0,142,0.5)",
                transition: "all 0.2s", letterSpacing: "0.04em",
              }}
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          {/* Footer */}
          <div style={{ marginTop: 26, fontSize: 10,
            color: "rgba(255,255,255,0.22)", lineHeight: 1.6 }}>
            STC · ACES Managed Services · Hajj 1447<br />
            Authorised users only
          </div>
        </div>
      </div>

      {/* Right side spacer (image shows through) */}
      <div style={{ flex: 1 }} />

      <style>{`
        input::placeholder { color: rgba(255,255,255,0.25); }
        input:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 1000px rgba(55,0,90,0.95) inset !important;
          -webkit-text-fill-color: #fff !important;
        }
      `}</style>
    </div>
  );
}
