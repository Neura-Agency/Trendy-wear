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

          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <img
              src="/logo.jpg"
              alt="Logo"
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '12px',
                objectFit: 'cover',
                marginBottom: '1rem'
              }}
            />
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>
              Trendy <span style={{ color: '#6366f1' }}>Wears</span>
            </h1>
            <p style={{ color: '#9ca3af', fontSize: '13px', marginTop: '6px', fontWeight: 400 }}>
              Smart ERP for Fashion Retail
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1.2rem' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Username</label>
              <input
                autoFocus
                placeholder="Enter User ID"
                value={creds.username}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCreds(c => ({ ...c, username: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  marginTop: '6px',
                  borderRadius: '10px',
                  border: '1.5px solid #e2e5ef',
                  fontSize: '13.5px',
                  fontFamily: 'inherit',
                  outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={(e) => { e.target.style.borderColor = '#6366f1'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'; }}
                onBlur={(e) => { e.target.style.borderColor = '#e2e5ef'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <div style={{ marginBottom: '1.2rem' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Password</label>
              <div style={{ position: 'relative', marginTop: '6px' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={creds.password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCreds(c => ({ ...c, password: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '10px 42px 10px 14px',
                    borderRadius: '10px',
                    border: '1.5px solid #e2e5ef',
                    fontSize: '13.5px',
                    fontFamily: 'inherit',
                    outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#6366f1'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#e2e5ef'; e.target.style.boxShadow = 'none'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0',
                    display: 'flex',
                    alignItems: 'center',
                    color: '#9ca3af',
                  }}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    // Eye-off icon
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    // Eye icon
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                background: '#fef2f2',
                color: '#dc2626',
                padding: '10px 14px',
                borderRadius: '10px',
                marginBottom: '1rem',
                fontSize: '13px',
                fontWeight: 500,
                border: '1px solid #fecaca',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                height: '44px',
                background: '#6366f1',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
                transition: '0.2s',
                fontFamily: 'inherit',
              }}
              onMouseOver={(e) => { (e.target as HTMLElement).style.background = '#4f46e5'; }}
              onMouseOut={(e) => { (e.target as HTMLElement).style.background = '#6366f1'; }}
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>

      {/* RIGHT SIDE - PROFESSIONAL FASHION BACKGROUND */}
      <div className="image-side" style={{
        flex: 2.5,
        position: 'relative',
        backgroundImage: `
          linear-gradient(135deg, rgba(30,27,75,0.85), rgba(99,102,241,0.7)),
          url('https://images.unsplash.com/photo-1441986300917-64674bd600d8')
        `,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem'
      }}>
        <div style={{ textAlign: 'center', maxWidth: '440px' }}>
          <h2 style={{ fontSize: '32px', marginBottom: '1rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
            Welcome to Trendy Wears ERP
          </h2>
          <p style={{ fontSize: '16px', opacity: 0.9, color: '#fff', fontWeight: 400, lineHeight: 1.7 }}>
            Effortless Inventory, Sales, and Store Management<br />
            <span style={{ color: '#c7d2fe', fontWeight: 600 }}>Professional tools for modern fashion businesses.</span>
          </p>
        </div>
      </div>

      {/* Responsive */}
      <style>
        {`
          @media (max-width: 768px) {
            .image-side {
              display: none;
            }
          }
        `}
      </style>

    </div>
  );
}
