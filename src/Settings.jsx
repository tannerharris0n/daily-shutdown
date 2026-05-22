// ╔══════════════════════════════════════════════════════════════╗
// ║  SETTINGS                                                    ║
// ║  BYO Anthropic key, clear/export/import history, stats.      ║
// ╚══════════════════════════════════════════════════════════════╝

import { useState, useRef, useMemo } from 'react';
import { getByoKey, setByoKey } from './api';
import { theme as T, fonts } from './theme';

const STORAGE_KEY_HISTORY = 'dailyShutdown:history';
const STORAGE_KEY_DRAFT = 'dailyShutdown:draft';

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function computeStreak(history) {
  if (!history.length) return { current: 0, longest: 0 };
  const dates = new Set(history.map(h => h.date));

  const parse = key => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const shift = (key, delta) => {
    const d = parse(key);
    d.setDate(d.getDate() + delta);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  let cursor = dates.has(today) ? today : (dates.has(shift(today, -1)) ? shift(today, -1) : null);
  let current = 0;
  while (cursor && dates.has(cursor)) {
    current += 1;
    cursor = shift(cursor, -1);
  }

  const sorted = [...dates].sort();
  let longest = 0, run = 0, prev = null;
  for (const k of sorted) {
    if (prev) {
      const ms = parse(k) - parse(prev);
      if (Math.round(ms / 86400000) === 1) run += 1;
      else run = 1;
    } else run = 1;
    if (run > longest) longest = run;
    prev = k;
  }
  return { current, longest };
}

function Section({ title, children, accent }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderLeft: `3px solid ${accent || T.border}`,
      borderRadius: '14px', padding: '20px 22px', marginBottom: '16px',
      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
    }}>
      <div style={{
        fontSize: '11px', fontWeight: '600', color: accent || T.textDim,
        letterSpacing: '0.5px', textTransform: 'uppercase',
        fontFamily: fonts.mono, marginBottom: '14px',
      }}>{title}</div>
      {children}
    </div>
  );
}

export default function Settings({ serverKeyPresent, onByoKeyChange }) {
  const [byoKey, setByoKeyState] = useState(getByoKey());
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState(loadHistory());
  const [confirmClear, setConfirmClear] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const fileRef = useRef(null);

  const stats = useMemo(() => computeStreak(history), [history]);

  const saveByo = () => {
    setByoKey(byoKey.trim());
    setSaved(true);
    if (onByoKeyChange) onByoKeyChange();
    setTimeout(() => setSaved(false), 1500);
  };

  const clearByo = () => {
    setByoKey('');
    setByoKeyState('');
    if (onByoKeyChange) onByoKeyChange();
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const exportHistory = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      version: 1,
      history,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    a.href = url;
    a.download = `daily-shutdown-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importHistory = (file) => {
    setImportMsg('');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        const incoming = Array.isArray(parsed) ? parsed : parsed.history;
        if (!Array.isArray(incoming)) throw new Error('No history array found in file.');

        // Merge by date, incoming wins on conflict.
        const byDate = new Map(history.map(h => [h.date, h]));
        let added = 0;
        for (const item of incoming) {
          if (!item || !item.date) continue;
          if (!byDate.has(item.date)) added += 1;
          byDate.set(item.date, item);
        }
        const merged = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(merged));
        setHistory(merged);
        setImportMsg(`Imported ${incoming.length} entries (${added} new).`);
      } catch (err) {
        setImportMsg('Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const clearAll = () => {
    localStorage.removeItem(STORAGE_KEY_HISTORY);
    localStorage.removeItem(STORAGE_KEY_DRAFT);
    setHistory([]);
    setConfirmClear(false);
  };

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '40px 24px 80px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: '600', color: T.text, margin: '0 0 6px', letterSpacing: '-0.3px' }}>Settings</h1>
      <p style={{ fontSize: '14px', color: T.textDim, margin: '0 0 28px', lineHeight: '1.55' }}>
        Everything lives in this browser. No accounts. No backend.
      </p>

      <Section title="Anthropic API key" accent={T.accent}>
        <p style={{ fontSize: '13px', color: T.textBody, margin: '0 0 12px', lineHeight: '1.55' }}>
          {serverKeyPresent
            ? 'The server has a key configured. You can override it for this browser by pasting your own below.'
            : 'No server-side key is configured. Paste your key here to use the app. It is stored only in this browser.'}
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="password"
            value={byoKey}
            onChange={e => setByoKeyState(e.target.value)}
            placeholder="sk-ant-..."
            style={{
              flex: 1, minWidth: '240px', padding: '12px 14px',
              background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: '10px',
              fontSize: '13px', fontFamily: fonts.mono, color: T.text,
            }}
          />
          <button onClick={saveByo} disabled={!byoKey.trim()} style={{
            padding: '12px 20px',
            background: saved ? T.green : (byoKey.trim() ? T.accent : T.textFaint),
            color: T.textInverse,
            border: 'none', borderRadius: '10px',
            fontSize: '13px', fontWeight: '600', fontFamily: fonts.body,
            cursor: byoKey.trim() ? 'pointer' : 'not-allowed',
          }}>{saved ? '✓ Saved' : 'Save key'}</button>
          {getByoKey() && (
            <button onClick={clearByo} style={{
              padding: '12px 16px',
              background: T.surfaceAlt, border: `1px solid ${T.border}`, color: T.textDim,
              borderRadius: '10px', fontSize: '13px', fontWeight: '500',
              fontFamily: fonts.body, cursor: 'pointer',
            }}>Clear</button>
          )}
        </div>
        <p style={{ fontSize: '11px', color: T.textFaint, margin: '12px 0 0', lineHeight: '1.5' }}>
          Get a key at <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" style={{ color: T.accent, textDecoration: 'underline' }}>console.anthropic.com</a>. Calls go through this app's server, which forwards your key only to Anthropic.
        </p>
      </Section>

      <Section title="Stats" accent={T.green}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '14px',
        }}>
          <Stat label="Current streak" value={`${stats.current} ${stats.current === 1 ? 'day' : 'days'}`} />
          <Stat label="Longest streak" value={`${stats.longest} ${stats.longest === 1 ? 'day' : 'days'}`} />
          <Stat label="Total shutdowns" value={history.length} />
        </div>
      </Section>

      <Section title="History" accent={T.amber}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <button onClick={exportHistory} disabled={!history.length} style={{
            padding: '10px 16px',
            background: history.length ? T.surfaceAlt : T.surfaceAlt,
            border: `1px solid ${T.border}`,
            color: history.length ? T.text : T.textFaint,
            borderRadius: '10px', fontSize: '13px', fontWeight: '500',
            fontFamily: fonts.body, cursor: history.length ? 'pointer' : 'not-allowed',
          }}>↓ Export as JSON</button>

          <button onClick={() => fileRef.current?.click()} style={{
            padding: '10px 16px',
            background: T.surfaceAlt, border: `1px solid ${T.border}`, color: T.text,
            borderRadius: '10px', fontSize: '13px', fontWeight: '500',
            fontFamily: fonts.body, cursor: 'pointer',
          }}>↑ Import JSON</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) importHistory(f); e.target.value = ''; }}
          />
        </div>
        {importMsg && (
          <div style={{ fontSize: '12px', color: T.textDim, marginBottom: '12px' }}>{importMsg}</div>
        )}

        {!confirmClear ? (
          <button onClick={() => setConfirmClear(true)} disabled={!history.length} style={{
            padding: '10px 16px',
            background: T.surfaceAlt, border: `1px solid ${T.redBorder}`,
            color: history.length ? T.red : T.textFaint,
            borderRadius: '10px', fontSize: '13px', fontWeight: '500',
            fontFamily: fonts.body, cursor: history.length ? 'pointer' : 'not-allowed',
          }}>Clear all history</button>
        ) : (
          <div style={{
            background: T.redDim, border: `1px solid ${T.redBorder}`,
            padding: '12px 14px', borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: '13px', color: T.red, fontWeight: '500' }}>
              Delete all {history.length} shutdowns? This cannot be undone.
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={clearAll} style={{
                padding: '8px 14px', background: T.red, color: T.textInverse,
                border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
                fontFamily: fonts.body, cursor: 'pointer',
              }}>Delete everything</button>
              <button onClick={() => setConfirmClear(false)} style={{
                padding: '8px 14px', background: T.surface, border: `1px solid ${T.border}`, color: T.textDim,
                borderRadius: '8px', fontSize: '12px', fontWeight: '500',
                fontFamily: fonts.body, cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        )}
      </Section>

      <Section title="About" accent={T.purple}>
        <p style={{ fontSize: '13px', color: T.textBody, margin: '0 0 8px', lineHeight: '1.6' }}>
          Daily Shutdown is open source.
        </p>
        <p style={{ fontSize: '12px', color: T.textFaint, margin: 0, lineHeight: '1.5' }}>
          MIT licensed. Fork it, host it, change anything you want.
        </p>
      </Section>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{
      background: T.surfaceAlt, border: `1px solid ${T.border}`,
      borderRadius: '10px', padding: '14px 16px',
    }}>
      <div style={{
        fontSize: '10px', fontWeight: '600', color: T.textFaint,
        letterSpacing: '0.5px', textTransform: 'uppercase', fontFamily: fonts.mono,
        marginBottom: '6px',
      }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: '700', color: T.text, letterSpacing: '-0.3px' }}>{value}</div>
    </div>
  );
}
