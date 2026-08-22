import { useState } from 'react';
import { LoginProps } from "../types";

interface Credentials {
  username: string;
  password: string;
}

export default function Login({ onLogin }: LoginProps) {
  const [creds, setCreds] = useState<Credentials>({ username: '', password: '' });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds)
      });
      if (!res.ok) { setError('Invalid username or password.'); return; }
      const user = await res.json();
      onLogin(user);
    } catch {
      setError('Could not connect. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-wrap">

      {/* LEFT SIDE - LOGIN */}
      <div className="login-container">
        <div className="login-card">

          <div className="auth-brand">
            <img src="/logo.jpg" alt="Trendy Wears logo" className="auth-logo" />
            <h1 className="auth-title">
              Trendy <span>Wears</span>
            </h1>
            <p className="auth-subtitle">Smart ERP for Fashion Retail</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-username">Username</label>
              <input
                id="auth-username"
                className="auth-input"
                autoFocus
                autoComplete="username"
                placeholder="Enter User ID"
                value={creds.username}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCreds(c => ({ ...c, username: e.target.value }))}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-password">Password</label>
              <div className="auth-input-wrap">
                <input
                  id="auth-password"
                  className="auth-input auth-input--password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={creds.password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCreds(c => ({ ...c, password: e.target.value }))}
                />
                <button
                  type="button"
                  className="auth-eye"
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="auth-error" role="alert" aria-live="polite">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Authenticating…' : 'Sign In'}
            </button>
          </form>

          <p className="auth-foot">Secure access for authorised staff only.</p>
        </div>
      </div>

      {/* RIGHT SIDE - PROFESSIONAL FASHION BACKGROUND */}
      <div className="image-side">
        <div className="image-side__inner">
          <span className="image-side__eyebrow">Trendy Wears ERP</span>
          <h2 className="image-side__title">Welcome to Trendy Wears ERP</h2>
          <p className="image-side__text">
            Effortless Inventory, Sales, and Store Management
          </p>
          <p className="image-side__accent">Professional tools for modern fashion businesses.</p>
          <ul className="image-side__list">
            <li>Live multi-store inventory</li>
            <li>Sales, returns &amp; refunds in one place</li>
            <li>Profit and expense reporting</li>
          </ul>
        </div>
      </div>

    </div>
  );
}
