import { useCallback, useEffect, useState } from "react";
import type { AppProps } from "next/app";
import "../styles/globals.css";
import Layout from "../components/Layout";
import { User } from "../types";

interface ExtendedAppProps extends AppProps {
  pageProps: {
    user?: User;
    onLogin?: (user: User) => void;
    onLogout?: () => void;
  };
}

export default function App({ Component, pageProps }: ExtendedAppProps) {
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    setHydrated(true);

    // Fast path: restore from localStorage to avoid a blank screen.
    try {
      const stored = localStorage.getItem("user");
      if (stored) setUser(JSON.parse(stored));
    } catch {
      // ignore bad localStorage
    }

    // Source of truth: server session cookie.
    ;(async () => {
      try {
        const res = await fetch('/api/me')
        if (!res.ok) {
          setUser(null)
          try { localStorage.removeItem('user') } catch {}
          return
        }
        const u = await res.json()
        setUser(u)
        try {
          localStorage.setItem('user', JSON.stringify(u))
        } catch {}
      } catch {
        // network errors: keep localStorage user if present
      }
    })()
  }, []);

  const onLogin = useCallback((u: User) => {
    setUser(u);
    try {
      localStorage.setItem("user", JSON.stringify(u));
    } catch {
      // ignore localStorage write failures
    }
  }, []);

  const onLogout = useCallback(() => {
    // Best-effort server logout (HttpOnly cookie session).
    fetch('/api/logout', { method: 'POST' }).catch(() => {})

    setUser(null);
    try {
      localStorage.removeItem("user");
    } catch {
      // ignore localStorage failures
    }
  }, []);

  if (!hydrated) return <div className="loading">Loading...</div>;

  const page = (
    <Component
      {...pageProps}
      user={user}
      onLogin={onLogin}
      onLogout={onLogout}
    />
  );

  // Only show the full app chrome (navbar/sidebar) once authenticated.
  if (!user) return page;

  return (
    <Layout user={user} onLogout={onLogout}>
      {page}
    </Layout>
  );
}
