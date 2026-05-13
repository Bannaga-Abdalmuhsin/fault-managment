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
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #1A0533 0%, #2D0654 40%, #1A0533 100%)",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      position: "relative", overflow: "hidden",
    }}>
      {/* Background glow effects */}
      <div style={{
        position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)",
        width: 600, height: 600, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(107,31,162,0.25) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: "10%", right: "10%",
        width: 300, height: 300, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(56,212,255,0.07) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Card */}
      <div style={{
        width: 420, padding: "40px 36px 36px",
        background: "rgba(75,0,110,0.82)", backdropFilter: "blur(24px)",
        border: "1px solid rgba(200,140,255,0.28)", borderRadius: 20,
        boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(200,140,255,0.1)",
        position: "relative",
      }}>
        {/* Top logos row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <img src="/stc-logo.png" alt="STC"
            style={{ height: 36, objectFit: "contain", filter: "brightness(1.1)" }} />
          <img src="/aces-logo.png" alt="ACES Managed Services"
            style={{ height: 44, objectFit: "contain" }} />
        </div>

        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: "0.02em" }}>
            COW HAJJ 1447
          </div>
          <div style={{ fontSize: 12, color: "rgba(200,140,255,0.75)", marginTop: 4, fontWeight: 500 }}>
            Monitoring Dashboard — Secure Access
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(200,140,255,0.2)", marginBottom: 24 }} />

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(200,140,255,0.85)",
              letterSpacing: "0.07em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
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
                width: "100%", padding: "11px 14px", boxSizing: "border-box",
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
              letterSpacing: "0.07em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
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
                width: "100%", padding: "11px 14px", boxSizing: "border-box",
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
                ? "rgba(107,31,162,0.5)"
                : "linear-gradient(135deg, #6B1FA2, #9B3DCC)",
              color: "#fff", fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
              boxShadow: loading ? "none" : "0 4px 20px rgba(107,31,162,0.5)",
              transition: "all 0.2s", letterSpacing: "0.04em",
            }}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        {/* Footer */}
        <div style={{ marginTop: 24, textAlign: "center", fontSize: 10,
          color: "rgba(255,255,255,0.25)", lineHeight: 1.6 }}>
          STC · ACES Managed Services · Hajj 1447<br />
          Authorised users only
        </div>
      </div>

      <style>{`
        input::placeholder { color: rgba(255,255,255,0.25); }
        input:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 1000px rgba(75,0,110,0.9) inset !important;
          -webkit-text-fill-color: #fff !important;
        }
      `}</style>
    </div>
  );
}
