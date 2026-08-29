import { useCallback, useEffect, useState } from "react";
import type { AppProps } from "next/app";
import Head from "next/head";
import "../styles/globals.css";
import "../styles/design-system.css";
import "../styles/density.css";
import "../styles/dark.css";
import "../styles/dark-fixes.css";
import "../styles/login.css";
import "../styles/theme.css";
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

  // Theme: "light" | "dark" | "system". Presentation only — no data or logic
  // depends on it. The pre-paint script in pages/_document.tsx sets the initial
  // value; this effect only keeps it in sync with OS changes.
  useEffect(() => {
    const apply = () => {
      let pref = "dark";
      try {
        pref = localStorage.getItem("theme") || "dark";
      } catch {}
      const resolved =
        pref === "system"
          ? window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark"
          : pref === "light"
            ? "light"
            : "dark";
      document.documentElement.setAttribute("data-theme", resolved);
      document.documentElement.setAttribute("data-theme-pref", pref);
      document.documentElement.style.colorScheme = resolved;
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => apply();
    mq.addEventListener("change", onChange);
    window.addEventListener("themepreferencechange", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("themepreferencechange", onChange);
    };
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
        // Bail out with the SAME object reference when the confirmed session
        // matches what we already have (e.g. from the localStorage fast path).
        // Returning `prev` (not a new object) lets React skip the re-render,
        // so every page's `useEffect([user, ...])` data-fetch does NOT refire —
        // without this, every page fetched its data twice on each load.
        setUser(prev => (prev && JSON.stringify(prev) === JSON.stringify(u)) ? prev : u)
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
      <meta name="application-name" content="Trendy Wear" />
    </Head>
  );

  if (!hydrated)
    return (
      <>
        {favicon}
        <div className="app-boot" role="status" aria-live="polite">
          <div className="app-boot__inner">
            <div className="app-boot__mark" aria-hidden="true" />
            <span className="app-boot__text">Loading Trendy Wear\u2026</span>
          </div>
        </div>
      </>
    );

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
