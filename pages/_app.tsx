import { useCallback, useEffect, useState } from "react";
import type { AppProps } from "next/app";
import Head from "next/head";
import "../styles/globals.css";
import "../styles/design-system.css";
import "../styles/density.css";
import "../styles/dark.css";
import "../styles/dark-fixes.css";
import Layout from "../components/Layout";
import { PopupProvider } from "../components/Popup";
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

  // Auto-select number input content on focus so typing replaces 0 instead of appending
  useEffect(() => {
    const handler = (e: FocusEvent) => {
      const target = e.target as HTMLInputElement;
      if (target && (target.inputMode === 'numeric' || target.inputMode === 'decimal')) target.select();
    };
    document.addEventListener('focusin', handler);
    return () => document.removeEventListener('focusin', handler);
  }, []);

  // Theme (dark by default). Presentation only — no data or logic depends on it.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("theme");
      document.documentElement.setAttribute("data-theme", saved === "light" ? "light" : "dark");
    } catch {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  useEffect(() => {
    setHydrated(true);

    // Fast path: restore from localStorage to avoid a blank screen.
    try {
      const stored = localStorage.getItem("user");
      if (stored) setUser(JSON.parse(stored));
    } catch {
      try { localStorage.removeItem("user") } catch {}
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

  const favicon = (
    <Head>
      <title>Trendy Wear</title>
      <link rel="icon" type="image/jpeg" href="/logo.jpg" />
      <link rel="apple-touch-icon" href="/logo.jpg" />
      <link href="https://fonts.googleapis.com/css2?family=Pacifico&display=swap" rel="stylesheet" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <meta name="application-name" content="Trendy Wear" />
    </Head>
  );

  if (!hydrated) return <>{favicon}<div className="loading">Loading...</div></>;

  const page = (
    <Component
      {...pageProps}
      user={user}
      onLogin={onLogin}
      onLogout={onLogout}
    />
  );

  // Only show the full app chrome (navbar/sidebar) once authenticated.
  if (!user) return <>{favicon}<PopupProvider>{page}</PopupProvider></>;

  return (
    <>
      {favicon}
      <PopupProvider>
        <Layout user={user} onLogout={onLogout}>
          {page}
        </Layout>
      </PopupProvider>
    </>
  );
}
