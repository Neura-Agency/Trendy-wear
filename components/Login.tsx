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
      background: '#f5f7fa'
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
          borderRadius: '10px',
          padding: '3rem',
          maxWidth: '420px',
          width: '100%',
          height: '100vh',
          boxShadow: '0 10px 30px rgba(0,0,0,0.08)'
        }}>

          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <img
              src="/logo.jpg"
              alt="Logo"
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '14px',
                objectFit: 'cover',
                marginBottom: '1rem'
              }}
            />
            <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 700 }}>
              Trendy <span style={{ color: '#1677ff' }}>Wears</span>
            </h1>
            <p style={{ color: '#8c8c8c', fontSize: '14px', marginTop: '6px' }}>
              Smart ERP for Fashion Retail
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1.2rem' }}>
              <label style={{ fontSize: '14px' }}>Username</label>
              <input
                autoFocus
                placeholder="Enter User ID"
                value={creds.username}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCreds(c => ({ ...c, username: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '10px',
                  marginTop: '6px',
                  borderRadius: '6px',
                  border: '1px solid #d9d9d9'
                }}
              />
            </div>

            <div style={{ marginBottom: '1.2rem' }}>
              <label style={{ fontSize: '14px' }}>Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={creds.password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCreds(c => ({ ...c, password: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '10px',
                  marginTop: '6px',
                  borderRadius: '6px',
                  border: '1px solid #d9d9d9'
                }}
              />
            </div>

            {error && (
              <div style={{
                background: '#fff2f0',
                color: '#ff4d4f',
                padding: '10px',
                borderRadius: '6px',
                marginBottom: '1rem',
                fontSize: '14px'
              }}>
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                height: '44px',
                background: 'linear-gradient(90deg, #1677ff, #4096ff)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: '0.3s'
              }}
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
          linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)),
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
        <div style={{ textAlign: 'center', maxWidth: '470px' }}>
          <h2 style={{ fontSize: '36px', marginBottom: '1rem', fontWeight: 800, color: '#ffd700', letterSpacing: '-0.02em', textShadow: '0 2px 8px rgba(0,0,0,0.18)' }}>
            Welcome to Trendy Wears ERP
          </h2>
          <p style={{ fontSize: '18px', opacity: 0.95, color: '#fff', fontWeight: 500, textShadow: '0 1px 6px rgba(0,0,0,0.15)' }}>
            Effortless Inventory, Sales, and Store Management<br />
            <span style={{ color: '#00eaff', fontWeight: 700 }}>Professional tools for modern fashion businesses.</span>
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
