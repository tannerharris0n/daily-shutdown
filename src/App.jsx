import { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { checkAuth, login, logout, fetchConfig, getByoKey } from './api';
import { theme as T, fonts, baseStyles } from './theme';
import DailyShutdown from './DailyShutdown';
import Settings from './Settings';

// ─────────────────────────────────────────────────────────────────
// LOGIN GATE (only used if AUTH_PASSWORD is set on the server)
// ─────────────────────────────────────────────────────────────────
function LoginGate({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const submit = async () => {
    if (!password || loading) return;
    setLoading(true); setError('');
    const result = await login(password);
    setLoading(false);
    if (result.ok) onLogin();
    else { setAttempts(a => a + 1); setError(result.error); setPassword(''); }
  };

  return (
    <div style={{ background: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fonts.body }}>
      <style>{baseStyles}</style>
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: '16px',
        padding: '48px 40px', width: '380px', textAlign: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🌙</div>
        <h1 style={{ fontSize: '22px', fontWeight: '600', color: T.text, margin: '0 0 6px' }}>Daily Shutdown</h1>
        <p style={{ fontSize: '14px', color: T.textDim, margin: '0 0 28px', lineHeight: '1.5' }}>Enter the password to continue.</p>
        <input
          type="password" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Password" autoFocus disabled={attempts >= 5}
          style={{
            width: '100%', padding: '14px 16px', background: T.bg,
            border: `1px solid ${error ? T.red : T.border}`, borderRadius: '10px',
            color: T.text, fontSize: '15px', fontFamily: fonts.body, marginBottom: '14px',
          }}
        />
        <button onClick={submit} disabled={loading || !password || attempts >= 5} style={{
          width: '100%', padding: '14px',
          background: attempts >= 5 ? T.textFaint : T.accent,
          color: T.textInverse, border: 'none', borderRadius: '10px',
          fontSize: '15px', fontWeight: '600', fontFamily: fonts.body,
          cursor: attempts >= 5 ? 'not-allowed' : 'pointer',
        }}>
          {loading ? 'Verifying…' : attempts >= 5 ? 'Locked — try again later' : 'Sign in'}
        </button>
        {error && <p style={{ fontSize: '13px', color: T.red, marginTop: '14px' }}>{error}</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// API KEY GATE — shown when no server-side key AND no BYO key
// ─────────────────────────────────────────────────────────────────
function ApiKeyGate() {
  const navigate = useNavigate();
  return (
    <div style={{ background: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fonts.body, padding: '24px' }}>
      <style>{baseStyles}</style>
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: '16px',
        padding: '40px', maxWidth: '460px', textAlign: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔑</div>
        <h1 style={{ fontSize: '20px', fontWeight: '600', color: T.text, margin: '0 0 8px' }}>Configure your API key</h1>
        <p style={{ fontSize: '14px', color: T.textDim, margin: '0 0 24px', lineHeight: '1.55' }}>
          Daily Shutdown needs an Anthropic API key to generate reflections. Either set <code style={{ fontFamily: fonts.mono, fontSize: '12px', background: T.surfaceAlt, padding: '1px 6px', borderRadius: '4px' }}>ANTHROPIC_API_KEY</code> on the server, or paste a key into Settings and the app will use it for your browser only.
        </p>
        <button onClick={() => navigate('/settings')} style={{
          padding: '12px 22px', background: T.accent, color: T.textInverse,
          border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600',
          fontFamily: fonts.body, cursor: 'pointer',
        }}>Open Settings</button>
        <p style={{ fontSize: '12px', color: T.textFaint, margin: '20px 0 0', lineHeight: '1.5' }}>
          Get a key at <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" style={{ color: T.accent, textDecoration: 'underline' }}>console.anthropic.com</a>
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// MAIN SHELL — header + routes
// ─────────────────────────────────────────────────────────────────
function MainShell({ authEnabled, serverKeyPresent, onLogout, onByoKeyChange }) {
  const location = useLocation();
  const onSettings = location.pathname === '/settings';

  // Re-evaluate on every render so a BYO key paste in Settings unblocks the app.
  const byo = getByoKey();
  const hasKey = serverKeyPresent || !!byo;

  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: fonts.body, color: T.text }}>
      <style>{baseStyles}</style>

      <div style={{
        background: T.surface, borderBottom: `1px solid ${T.border}`,
        padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: '56px',
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>🌙</span>
          <span style={{ fontSize: '17px', fontWeight: '700', color: T.text, letterSpacing: '-0.3px' }}>Daily Shutdown</span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {onSettings ? (
            <Link to="/" style={{
              padding: '7px 14px', fontSize: '13px', fontWeight: '500', color: T.textDim,
              borderRadius: '8px', fontFamily: fonts.body,
              background: T.surfaceAlt, border: `1px solid ${T.border}`,
            }}>← Back</Link>
          ) : (
            <Link to="/settings" style={{
              padding: '7px 14px', fontSize: '13px', fontWeight: '500', color: T.textDim,
              borderRadius: '8px', fontFamily: fonts.body,
              background: T.surfaceAlt, border: `1px solid ${T.border}`,
            }}>Settings</Link>
          )}
          {authEnabled && (
            <button onClick={onLogout} style={{
              background: T.surfaceAlt, border: `1px solid ${T.border}`, color: T.textDim,
              padding: '7px 14px', fontSize: '13px', fontFamily: fonts.body, borderRadius: '8px',
              cursor: 'pointer', fontWeight: '500',
            }}>Sign out</button>
          )}
        </div>
      </div>

      <Routes>
        <Route path="/settings" element={<Settings serverKeyPresent={serverKeyPresent} onByoKeyChange={onByoKeyChange} />} />
        <Route path="*" element={hasKey ? <DailyShutdown /> : <ApiKeyGate />} />
      </Routes>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────
export default function App() {
  // null = still checking; false = auth required and not yet signed in.
  const [authed, setAuthed] = useState(null);
  const [config, setConfig] = useState(null);
  const [byoTick, setByoTick] = useState(0); // bump to re-evaluate hasKey

  useEffect(() => {
    Promise.all([fetchConfig(), checkAuth()]).then(([cfg, ok]) => {
      setConfig(cfg);
      setAuthed(ok);
    });
  }, []);

  if (authed === null || config === null) {
    return (
      <div style={{ background: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{baseStyles}</style>
        <div style={{
          width: '32px', height: '32px',
          border: `3px solid ${T.border}`,
          borderTop: `3px solid ${T.accent}`,
          borderRadius: '50%', animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    );
  }

  if (config.auth_enabled && !authed) return <LoginGate onLogin={() => setAuthed(true)} />;

  return (
    <MainShell
      key={byoTick}
      authEnabled={config.auth_enabled}
      serverKeyPresent={config.server_key_present}
      onLogout={async () => { await logout(); setAuthed(false); }}
      onByoKeyChange={() => setByoTick(t => t + 1)}
    />
  );
}
