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
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: '#f8f9fc'
    }}>

      {/* LEFT SIDE - LOGIN */}
      <div style={{
        flex: 1,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center', 
      }}>
        <div style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          padding: '3rem',
          maxWidth: '400px',
          width: '100%',
          height: '100vh',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          border: '1px solid #e2e5ef',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}>

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
              <input
                type="password"
                placeholder="••••••••"
                value={creds.password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCreds(c => ({ ...c, password: e.target.value }))}
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
