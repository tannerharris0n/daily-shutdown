// Client API wrapper. Mirrors adhd-tools' api.js but with two additions:
//   - reads a BYO Anthropic key from localStorage and forwards it as X-Anthropic-Key
//   - tolerates open-mode (no auth) by treating absent csrf_token as fine

let csrfToken = null;
let authEnabled = null; // null = unknown, true/false once /api/auth/check has answered

const BYO_KEY_STORAGE = 'dailyShutdown:anthropicKey';

export function setCsrfToken(token) { csrfToken = token; }
export function getCsrfToken() { return csrfToken; }
export function isAuthEnabled() { return authEnabled; }

export function getByoKey() {
  try { return localStorage.getItem(BYO_KEY_STORAGE) || ''; } catch { return ''; }
}
export function setByoKey(key) {
  try {
    if (key) localStorage.setItem(BYO_KEY_STORAGE, key);
    else localStorage.removeItem(BYO_KEY_STORAGE);
  } catch {}
}

export async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return { auth_enabled: false, server_key_present: false };
    return await res.json();
  } catch {
    return { auth_enabled: false, server_key_present: false };
  }
}

export async function checkAuth() {
  try {
    const res = await fetch('/api/auth/check', { credentials: 'include' });
    const data = await res.json();
    authEnabled = !!data.auth_enabled;

    if (!authEnabled) return true; // open mode

    if (data.authenticated && data.csrf_token) {
      csrfToken = data.csrf_token;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function login(password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ password }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.ok) {
    if (data.csrf_token) csrfToken = data.csrf_token;
    return { ok: true };
  }
  return { ok: false, error: data.error || 'Login failed' };
}

export async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  csrfToken = null;
}

export async function callClaude({ messages, max_tokens, system }) {
  const body = { messages };
  if (max_tokens) body.max_tokens = max_tokens;
  if (system) body.system = system;

  const headers = { 'Content-Type': 'application/json' };
  if (authEnabled && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const byo = getByoKey();
  if (byo) headers['X-Anthropic-Key'] = byo;

  const res = await fetch('/api/claude', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(body),
  });

  if (res.status === 401) throw new Error('SESSION_EXPIRED');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}
