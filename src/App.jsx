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
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", background: "#f0edf0" }}>
        <div style={{ textAlign: "center" }}>
          <img src="/kraft-logo.png" alt="Kraft" style={{ width: "56px", height: "56px", marginBottom: "12px", objectFit: "contain" }} />
          <div style={{ color: "#5a6a7a" }}>Loading...</div>
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