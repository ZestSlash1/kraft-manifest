import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Auth from "./Auth";
import CargoApp from "./CargoApp";

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
        background: "#f0edf0",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>⚓</div>
          <div style={{ color: "#5a6a7a" }}>Loading...</div>
        </div>
      </div>
    );
  }

  return session ? <CargoApp session={session} /> : <Auth />;
}