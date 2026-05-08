import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Auth from "./Auth";
import CargoApp from "./CargoApp";
import ResetPassword from "./ResetPassword";

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0d1e3c 0%, #1a3a6a 100%)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          {/* Logo with pulsing glow */}
          <div style={{ position: "relative", marginBottom: "24px" }}>
            <div style={{ position: "absolute", width: "80px", height: "80px", borderRadius: "50%", background: "rgba(245, 158, 60, 0.3)", filter: "blur(20px)", animation: "pulse 2s infinite" }}></div>
            <img src="/kraft-logo.png" alt="Kraft" style={{ width: "80px", height: "80px", objectFit: "contain", borderRadius: "16px", position: "relative", zIndex: 1 }} />
          </div>

          {/* Animated text */}
          <div style={{ color: "#f0edf0", fontSize: "18px", fontWeight: 700, letterSpacing: "0.1em", marginBottom: "20px" }}>KRAFT MANIFEST</div>

          {/* Spinner */}
          <div style={{ display: "flex", justifyContent: "center", gap: "6px" }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: "8px", height: "8px", borderRadius: "50%",
                background: "#f59e3c",
                animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite`
              }} />
            ))}
          </div>

          <div style={{ color: "rgba(240,237,240,0.6)", fontSize: "13px", fontWeight: 500, marginTop: "16px", letterSpacing: "0.05em" }}>Loading...</div>
        </div>

        <style>{`
          @keyframes bounce {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
            40% { transform: scale(1); opacity: 1; }
          }
          @keyframes pulse {
            0%, 100% { opacity: 0.3; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.1); }
          }
        `}</style>
      </div>
    );
  }

  // Reset password route
  if (path === "/reset-password" || window.location.hash.includes("type=recovery")) {
    return <ResetPassword />;
  }

  return session ? <CargoApp session={session} /> : <Auth />;
}