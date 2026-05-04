import { useState } from "react";
import { supabase } from "./supabaseClient";

const NAVY = "#0d1e3c";
const NAVY2 = "#1a3a6a";
const OFFWHITE = "#f0edf0";
const BORDER = "#d0cad8";
const MUTED = "#5a6a7a";

export default function Auth() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [resetMode, setResetMode] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (resetMode) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setMessage({
          type: "success",
          text: "Password reset link sent! Check your email and click the link to set a new password.",
        });
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage({
          type: "success",
          text: "Account created! Please check your email to confirm, then log in.",
        });
        setMode("login");
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY2} 100%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px", fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
      `}</style>

      <div style={{
        background: OFFWHITE, borderRadius: "16px", padding: "32px",
        maxWidth: "400px", width: "100%",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
      }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <img src="/kraft-logo.png" alt="Kraft" style={{ width: "72px", height: "72px", marginBottom: "8px", objectFit: "contain" }} />
          <div style={{ fontSize: "20px", fontWeight: 700, color: NAVY }}>Kraft Shipping</div>
          <div style={{ fontSize: "12px", color: MUTED, marginTop: "4px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Cargo Manifest
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {[["login", "Login"], ["signup", "Sign Up"]].map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m); setMessage(null); }}
              style={{
                flex: 1, padding: "10px", borderRadius: "8px",
                background: mode === m ? NAVY : "#fff",
                color: mode === m ? "#fff" : NAVY,
                border: `1px solid ${mode === m ? NAVY : BORDER}`,
                fontWeight: 600, fontSize: "13px", cursor: "pointer",
              }}>
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>
              Email
            </label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="you@example.com"
              style={{
                width: "100%", padding: "10px 14px", borderRadius: "8px",
                border: `1px solid ${BORDER}`, fontSize: "14px", outline: "none", background: "#fff",
                color: NAVY, fontFamily: "inherit",
              }}
            />
          </div>

          {!resetMode && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <label style={{ fontSize: "11px", fontWeight: 700, color: NAVY2, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Password
                </label>
                {mode === "login" && (
                  <button type="button" onClick={() => { setResetMode(true); setMessage(null); }}
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: NAVY2, fontSize: "11px", fontWeight: 600, padding: 0, textDecoration: "underline" }}>
                    Forgot password?
                  </button>
                )}
              </div>
              <div style={{ position: "relative" }}>
                <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required
                  placeholder={mode === "signup" ? "Min 6 characters" : "Your password"}
                  minLength={6}
                  style={{
                    width: "100%", padding: "10px 44px 10px 14px", borderRadius: "8px",
                    border: `1px solid ${BORDER}`, fontSize: "14px", outline: "none", background: "#fff",
                    color: NAVY, fontFamily: "inherit", boxSizing: "border-box",
                  }}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)",
                    background: "transparent", border: "none", cursor: "pointer",
                    padding: "6px 8px", fontSize: "16px", color: MUTED, lineHeight: 1,
                  }}
                  aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? "🙈" : "👁"}
                </button>
              </div>
            </div>
          )}

          {resetMode && (
            <div style={{ marginBottom: "12px", padding: "10px 14px", background: "#e8eef8", border: "1px solid #b8c8e0", borderRadius: "8px", fontSize: "12px", color: NAVY2 }}>
              We'll email you a link to reset your password.
              <br />
              <button type="button" onClick={() => { setResetMode(false); setMessage(null); }}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: NAVY, fontSize: "12px", fontWeight: 700, padding: "6px 0 0", textDecoration: "underline" }}>
                ← Back to login
              </button>
            </div>
          )}


          {message && (
            <div style={{
              padding: "10px 14px", marginBottom: "14px", borderRadius: "8px",
              background: message.type === "error" ? "#fdecea" : "#e6f7ed",
              border: `1px solid ${message.type === "error" ? "#f5b8b0" : "#9eddb8"}`,
              color: message.type === "error" ? "#c0392b" : "#1a5c32",
              fontSize: "12px",
            }}>
              {message.text}
            </div>
          )}

          <button type="submit" disabled={loading}
            style={{
              width: "100%", padding: "12px", borderRadius: "10px",
              background: NAVY, color: "#fff", border: "none",
              fontWeight: 700, fontSize: "14px", cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1, letterSpacing: "0.03em",
            }}>
            {loading ? "Please wait..." : resetMode ? "📧 Send Reset Link" : (mode === "login" ? "🔐 Log In" : "✨ Create Account")}
          </button>
        </form>

        <div style={{ marginTop: "20px", fontSize: "11px", color: MUTED, textAlign: "center", lineHeight: "1.5" }}>
          {mode === "signup"
            ? "First time? Create an account using your work email."
            : "Don't have an account? Tap Sign Up above."}
        </div>
      </div>
    </div>
  );
}