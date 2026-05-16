var express = require('express');
var path = require('path');
var helmet = require('helmet');
var rateLimit = require('express-rate-limit');
var cookieParser = require('cookie-parser');
var crypto = require('crypto');

var app = express();
var PORT = process.env.PORT || 3000;

// ── ENV ──
var AUTH_PASSWORD = process.env.AUTH_PASSWORD || '';
var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
var SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
var NODE_ENV = process.env.NODE_ENV || 'production';
var AUTH_ENABLED = !!AUTH_PASSWORD;

// ── HELMET ──
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// ── RATE LIMITING ──
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again later.' },
}));

var authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  skipSuccessfulRequests: true,
});

var apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'API rate limit reached. Try again later.' },
});

// ── SESSION / CSRF ──
function generateSessionToken() {
  return crypto.randomBytes(48).toString('hex');
}

function signToken(token) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(token).digest('hex');
}

function verifySession(req) {
  var token = req.cookies && req.cookies.session_token;
  var sig = req.cookies && req.cookies.session_sig;
  if (!token || !sig) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(signToken(token), 'hex'));
  } catch { return false; }
}

function generateCsrfToken(sessionToken) {
  return crypto.createHmac('sha256', SESSION_SECRET).update('csrf:' + sessionToken).digest('hex').substring(0, 32);
}

function verifyCsrf(req) {
  var token = req.cookies && req.cookies.session_token;
  var csrfHeader = req.headers['x-csrf-token'];
  if (!token || !csrfHeader) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(csrfHeader), Buffer.from(generateCsrfToken(token)));
  } catch { return false; }
}

function requireAuth(req, res, next) {
  if (!AUTH_ENABLED) return next();
  if (!verifySession(req)) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function requireCsrf(req, res, next) {
  if (!AUTH_ENABLED) return next();
  if (!verifyCsrf(req)) return res.status(403).json({ error: 'Invalid CSRF token' });
  next();
}

// ── AUTH ROUTES ──
app.get('/api/auth/check', function(req, res) {
  if (!AUTH_ENABLED) return res.json({ authenticated: true, auth_enabled: false });
  if (!verifySession(req)) return res.status(401).json({ authenticated: false, auth_enabled: true });
  return res.json({
    authenticated: true,
    auth_enabled: true,
    csrf_token: generateCsrfToken(req.cookies.session_token),
  });
});

app.post('/api/auth/login', authLimiter, function(req, res) {
  if (!AUTH_ENABLED) return res.json({ ok: true, auth_enabled: false });
  var password = req.body && req.body.password;
  if (!password || typeof password !== 'string') return res.status(400).json({ error: 'Password required' });

  var input = Buffer.from(password);
  var expected = Buffer.from(AUTH_PASSWORD);
  var match = false;
  if (input.length === expected.length) { match = crypto.timingSafeEqual(input, expected); }
  if (!match) return res.status(401).json({ error: 'Invalid password' });

  var token = generateSessionToken();
  var sig = signToken(token);
  var cookieOpts = {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };

  res.cookie('session_token', token, cookieOpts);
  res.cookie('session_sig', sig, cookieOpts);
  return res.json({ ok: true, csrf_token: generateCsrfToken(token) });
});

app.post('/api/auth/logout', function(req, res) {
  res.clearCookie('session_token', { path: '/' });
  res.clearCookie('session_sig', { path: '/' });
  return res.json({ ok: true });
});

// ── CONFIG ROUTE ──
// Lets the client know whether a server-side API key is set, so it can decide
// whether to show the BYO-key prompt in Settings.
app.get('/api/config', function(req, res) {
  return res.json({
    auth_enabled: AUTH_ENABLED,
    server_key_present: !!ANTHROPIC_API_KEY,
  });
});

// ── ANTHROPIC API PROXY ──
// Accepts an optional X-Anthropic-Key header so a forker without the env var
// can paste a key into Settings and still use the app.
app.post('/api/claude', requireAuth, requireCsrf, apiLimiter, async function(req, res) {
  var headerKey = req.headers['x-anthropic-key'];
  var apiKey = (typeof headerKey === 'string' && headerKey.trim()) || ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'No Anthropic API key. Set ANTHROPIC_API_KEY env var or paste a key in Settings.' });

  var body = req.body;
  if (!body || !Array.isArray(body.messages)) return res.status(400).json({ error: 'Invalid request: messages required' });

  body.model = 'claude-sonnet-4-20250514';
  if (!body.max_tokens || body.max_tokens > 4096) body.max_tokens = 4096;

  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    var data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: (data && data.error && data.error.message) || 'API error' });
    return res.json(data);
  } catch (err) {
    console.error('Anthropic API error:', err.message);
    return res.status(500).json({ error: 'Failed to reach Anthropic API' });
  }
});

// ── STATIC + SPA FALLBACK ──
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', function(req, res) {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, function() {
  console.log('Daily Shutdown running on port ' + PORT + ' (' + NODE_ENV + ')');
  console.log('  Auth: ' + (AUTH_ENABLED ? 'enabled' : 'open mode'));
  console.log('  Server API key: ' + (ANTHROPIC_API_KEY ? 'configured' : 'unset (users must paste a key in Settings)'));
});
