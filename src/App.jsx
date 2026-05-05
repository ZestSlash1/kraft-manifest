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
      <div style={{ minHeight: "100vh", background: "#f0edf0", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", fontFamily: "sans-serif" }}>
        
        {/* Hidden SVG Filter required for the gooey melt effect */}
        <svg style={{ position: "absolute", width: 0, height: 0 }}>
          <defs>
            <filter id="gooey-filter">
              <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
              <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo" />
              <feBlend in="SourceGraphic" in2="goo" />
            </filter>
          </defs>
        </svg>

        <div style={{ textAlign: "center" }}>
          <div className="goo-container">
            <div className="goo-blob blob-1"></div>
            <div className="goo-blob blob-2"></div>
            <div className="goo-blob blob-3"></div>
          </div>
          <div style={{ color: "#5a6a7a", fontSize: "14px", fontWeight: 600, letterSpacing: "0.05em" }}></div>
        </div>
      </div>
    );
  }

  // Reset password route
  if (path === "/reset-password" || window.location.hash.includes("type=recovery")) {
    return <ResetPassword />;
  }

  return session ? <CargoApp session={session} /> : <Auth />;
}