import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

const NAVY = "#0d1e3c";
const NAVY2 = "#1a3a6a";
const OFFWHITE = "#f0edf0";
const BORDER = "#d0cad8";
const MUTED = "#5a6a7a";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [validSession, setValidSession] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Supabase auto-handles the URL hash from the reset link
    supabase.auth.getSession().then(({ data: { session } }) => {
      setValidSession(!!session);
      setChecking(false);
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords don't match." });
      return;
    }
    if (password.length < 6) {
      setMessage({ type: "error", text: "Password must be at least 6 characters." });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMessage({ type: "success", text: "Password updated! Redirecting to login..." });
      setTimeout(() => { window.location.href = "/"; }, 2000);
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div style={{ minHeight: "100vh", background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "sans-serif" }}>
        <div>Checking link...</div>
      </div>
    );
  }

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

      <div style={{ background: OFFWHITE, borderRadius: "16px", padding: "32px", maxWidth: "400px", width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <img src="/kraft-logo.png" alt="Kraft" style={{ width: "72px", height: "72px", marginBottom: "8px", objectFit: "contain" }} />
          <div style={{ fontSize: "20px", fontWeight: 700, color: NAVY }}>Reset Password</div>
          <div style={{ fontSize: "12px", color: MUTED, marginTop: "4px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Set a new password
          </div>
        </div>

        {!validSession ? (
          <div style={{ padding: "16px", background: "#fdecea", border: "1px solid #f5b8b0", borderRadius: "8px", color: "#c0392b", fontSize: "13px", textAlign: "center" }}>
            <div style={{ fontWeight: 700, marginBottom: "4px" }}>⚠️ Invalid or Expired Link</div>
            <div style={{ fontSize: "12px" }}>This reset link is no longer valid. Please request a new one.</div>
            <button onClick={() => { window.location.href = "/"; }}
              style={{ marginTop: "12px", padding: "8px 16px", borderRadius: "8px", background: NAVY, color: "#fff", border: "none", fontWeight: 600, fontSize: "12px", cursor: "pointer" }}>
              Back to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>
                New Password
              </label>
              <div style={{ position: "relative" }}>
                <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required minLength={6} placeholder="Min 6 characters"
                  style={{ width: "100%", padding: "10px 44px 10px 14px", borderRadius: "8px", border: `1px solid ${BORDER}`, fontSize: "14px", outline: "none", background: "#fff", color: NAVY, fontFamily: "inherit", boxSizing: "border-box" }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", padding: "6px 8px", fontSize: "16px", color: MUTED, lineHeight: 1 }}>
                  {showPassword ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>
                Confirm Password
              </label>
              <input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} placeholder="Repeat password"
                style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: `1px solid ${BORDER}`, fontSize: "14px", outline: "none", background: "#fff", color: NAVY, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>

            {message && (
              <div style={{ padding: "10px 14px", marginBottom: "14px", borderRadius: "8px", background: message.type === "error" ? "#fdecea" : "#e6f7ed", border: `1px solid ${message.type === "error" ? "#f5b8b0" : "#9eddb8"}`, color: message.type === "error" ? "#c0392b" : "#1a5c32", fontSize: "12px" }}>
                {message.text}
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ width: "100%", padding: "12px", borderRadius: "10px", background: NAVY, color: "#fff", border: "none", fontWeight: 700, fontSize: "14px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, letterSpacing: "0.03em" }}>
              {loading ? "Updating..." : "🔐 Update Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}