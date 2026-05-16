// ╔══════════════════════════════════════════════════════════════╗
// ║  DAILY SHUTDOWN                                              ║
// ║  60-second end-of-day ritual. Form → Claude reflection →     ║
// ║  tomorrow's top 3 + a shutdown sentence. Streak counter and  ║
// ║  90-day history stored entirely in localStorage.             ║
// ╚══════════════════════════════════════════════════════════════╝

import { useState, useEffect, useMemo } from 'react';
import { callClaude } from './api';
import { theme as T, fonts } from './theme';

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────
const STORAGE_KEY_DRAFT = 'dailyShutdown:draft';
const STORAGE_KEY_HISTORY = 'dailyShutdown:history';
const HISTORY_DAYS = 90;
const PATTERN_WINDOW = 7;

const ENERGY_LEVELS = [
  { value: 1, label: 'wrecked' },
  { value: 2, label: 'low' },
  { value: 3, label: 'okay' },
  { value: 4, label: 'sharp' },
  { value: 5, label: 'peak' },
];

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────
function loadLS(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function saveLS(key, data) { try { localStorage.setItem(key, JSON.stringify(data)); } catch {} }

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateFromKey(key) {
  // Parse YYYY-MM-DD as local (not UTC) so streak math works around midnight.
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(aKey, bKey) {
  const ms = dateFromKey(bKey) - dateFromKey(aKey);
  return Math.round(ms / 86400000);
}

function shiftDate(key, deltaDays) {
  const d = dateFromKey(key);
  d.setDate(d.getDate() + deltaDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computeStreak(history) {
  if (!history.length) return { current: 0, longest: 0 };

  const dates = new Set(history.map(h => h.date));
  const today = todayKey();
  const yesterday = shiftDate(today, -1);

  // Current streak counts back from today (or yesterday if today not done).
  let cursor = dates.has(today) ? today : (dates.has(yesterday) ? yesterday : null);
  let current = 0;
  while (cursor && dates.has(cursor)) {
    current += 1;
    cursor = shiftDate(cursor, -1);
  }

  // Longest streak across whole history.
  const sorted = [...dates].sort();
  let longest = 0, run = 0, prev = null;
  for (const k of sorted) {
    if (prev && daysBetween(prev, k) === 1) run += 1;
    else run = 1;
    if (run > longest) longest = run;
    prev = k;
  }

  return { current, longest };
}

function trimOldHistory(history) {
  const cutoff = shiftDate(todayKey(), -HISTORY_DAYS);
  return history.filter(h => h.date >= cutoff);
}

function extractText(res) {
  return (res?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

function parseJSON(text) {
  let s = (text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const f = s.indexOf('{'), l = s.lastIndexOf('}');
  if (f >= 0 && l > f) s = s.slice(f, l + 1);
  return JSON.parse(s);
}

function formatDateLong(key) {
  const d = dateFromKey(key);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You help an ADHD-prone maker run a 60-second end-of-day shutdown ritual. The user types a few quick inputs and you reflect the day back, pick tomorrow's top 3, and write a "shutdown sentence" so their brain can stop chewing on work after hours.

VOICE:
- A sharp peer reviewing the day with the user. Direct. Honest. Kind but not soft.
- Short sentences. ADHD-friendly skimmability.
- Realistic. If something is stuck, say it. If a win is real, name it.

HARD RULES:
- No em dashes anywhere. Use commas, periods, parens, or colons.
- No cheerleading: never write "amazing", "awesome", "great job", "you've got this", "crushing it", "you did your best", "proud of you", "way to go".
- No throat-clearing intros ("Today you...", "Let's take a look at...").
- No vague affirmations. Concrete observations only.
- Use contractions. Plain words.
- Tomorrow's top 3 must be SPECIFIC and ACTIONABLE. Pull them from the user's "looming" plus any carryover from "stuck". Each ≤ 12 words. No "work on X". Prefer verbs like draft, send, call, fix, finish, ship, decide.
- Shutdown sentence must be CONCRETE. It names what's done and what tomorrow starts with. Not "rest well" type fluff.
- pattern_note is OPTIONAL. Only fill it if the last-7-days history clearly shows something worth saying (a recurring stuck item, an energy trend, a repeated win). If nothing is clear, return null. Do NOT force a pattern.

OUTPUT FORMAT: Respond with ONLY valid JSON. No markdown fences, no preamble, no trailing commentary.

{
  "day_in_review": "2 to 3 sentences reflecting today back honestly.",
  "top_3": ["item one", "item two", "item three"],
  "shutdown_sentence": "One sentence the user can read out loud to close the day.",
  "pattern_note": "string or null"
}`;

// ─────────────────────────────────────────────────────────────────
// UI PRIMITIVES
// ─────────────────────────────────────────────────────────────────
function CopyBtn({ text, label = 'Copy', small = false }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch {}
  };
  return (
    <button onClick={copy} type="button" style={{
      background: copied ? T.greenDim : T.surfaceAlt,
      border: `1px solid ${copied ? T.greenBorder : T.border}`,
      color: copied ? T.green : T.textDim,
      padding: small ? '4px 10px' : '6px 12px',
      fontSize: small ? '11px' : '12px',
      fontFamily: fonts.body, fontWeight: '500', borderRadius: '6px',
      cursor: 'pointer', transition: 'all 0.15s',
      display: 'inline-flex', alignItems: 'center', gap: '5px',
    }}>{copied ? '✓ Copied' : '⧉ ' + label}</button>
  );
}

function SectionCard({ title, subtitle, children, action, accent }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: '14px', padding: '20px 22px', marginBottom: '14px',
      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      borderLeft: accent ? `3px solid ${accent}` : `1px solid ${T.border}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: '600', color: accent || T.textDim, letterSpacing: '0.5px', textTransform: 'uppercase', fontFamily: fonts.mono }}>{title}</div>
          {subtitle && <div style={{ fontSize: '12px', color: T.textFaint, marginTop: '2px' }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Label({ children, optional }) {
  return (
    <div style={{
      fontSize: '11px', fontWeight: '600', color: T.textDim,
      letterSpacing: '0.5px', textTransform: 'uppercase',
      fontFamily: fonts.mono, marginBottom: '8px',
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    }}>
      <span>{children}</span>
      {optional && <span style={{ fontSize: '10px', color: T.textFaint, textTransform: 'none', letterSpacing: 0, fontFamily: fonts.body }}>optional</span>}
    </div>
  );
}

function Textarea({ value, onChange, placeholder, minHeight = '90px' }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', minHeight, padding: '12px 14px',
        background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: '10px',
        fontSize: '14px', fontFamily: fonts.body, color: T.text, lineHeight: '1.55',
        resize: 'vertical',
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────
// STREAK HEADER
// ─────────────────────────────────────────────────────────────────
function StreakHeader({ history }) {
  const { current, longest } = useMemo(() => computeStreak(history), [history]);

  return (
    <div style={{ marginBottom: '24px', textAlign: 'center' }}>
      {current > 0 ? (
        <>
          <div style={{ fontSize: '32px', fontWeight: '700', color: T.text, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
            <span style={{ fontSize: '28px' }}>🔥</span>
            <span>{current} day streak</span>
          </div>
          <div style={{ fontSize: '12px', color: T.textFaint, marginTop: '6px', fontFamily: fonts.mono, letterSpacing: '0.3px' }}>
            longest: {longest} {longest === 1 ? 'day' : 'days'}
          </div>
        </>
      ) : (
        <div style={{ fontSize: '20px', fontWeight: '500', color: T.textDim }}>
          Start a streak today.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// HISTORY DRAWER
// ─────────────────────────────────────────────────────────────────
function HistoryDrawer({ history, open, onToggle, onSelect, selectedKey }) {
  return (
    <>
      <button onClick={onToggle} style={{
        position: 'fixed', top: '76px', right: '20px', zIndex: 30,
        background: T.surface, border: `1px solid ${T.border}`,
        padding: '8px 14px', fontSize: '12px', fontWeight: '500',
        borderRadius: '8px', cursor: 'pointer', fontFamily: fonts.body, color: T.textDim,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        📜 History
        {history.length > 0 && <span style={{ marginLeft: '6px', color: T.textFaint, fontFamily: fonts.mono }}>({history.length})</span>}
      </button>

      {open && (
        <>
          <div onClick={onToggle} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 40 }} />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: '400px', maxWidth: '92vw',
            background: T.surface, borderLeft: `1px solid ${T.border}`, zIndex: 41,
            overflowY: 'auto', padding: '24px', boxShadow: '-4px 0 20px rgba(0,0,0,0.08)',
            animation: 'slideIn 0.18s ease-out',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '15px', fontWeight: '600', color: T.text }}>History</div>
              <button onClick={onToggle} style={{ background: 'transparent', border: 'none', fontSize: '20px', color: T.textDim, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            {history.length === 0 ? (
              <div style={{ fontSize: '13px', color: T.textFaint, padding: '32px 0', textAlign: 'center' }}>
                Nothing yet. Run your first shutdown.
              </div>
            ) : history.map(item => {
              const isActive = item.date === selectedKey;
              return (
                <button key={item.date} onClick={() => onSelect(item.date)} style={{
                  width: '100%', textAlign: 'left', display: 'block',
                  background: isActive ? T.accentDim : T.surfaceAlt,
                  border: `1px solid ${isActive ? T.accentBorder : T.border}`,
                  borderRadius: '10px', padding: '12px 14px', marginBottom: '8px',
                  cursor: 'pointer', fontFamily: fonts.body,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>{formatDateLong(item.date)}</span>
                    <span style={{ fontSize: '11px', color: T.textFaint, fontFamily: fonts.mono }}>
                      energy {item.energy}/5
                    </span>
                  </div>
                  {item.biggest_win && (
                    <div style={{
                      fontSize: '12px', color: T.textDim, lineHeight: '1.4',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                      🏆 {item.biggest_win}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// OUTPUT CARDS
// ─────────────────────────────────────────────────────────────────
function OutputCard({ title, accent, children, copyText, action }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: '14px', padding: '20px 22px', marginBottom: '14px',
      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      animation: 'fadeIn 0.25s ease-out',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px', gap: '12px' }}>
        <div style={{
          fontSize: '11px', fontWeight: '600', color: accent,
          letterSpacing: '0.5px', textTransform: 'uppercase', fontFamily: fonts.mono,
        }}>{title}</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {action}
          {copyText && <CopyBtn text={copyText} small />}
        </div>
      </div>
      {children}
    </div>
  );
}

function ShutdownOutput({ result, dateLabel, readOnly }) {
  if (!result) return null;

  const copyAll = [
    `Daily Shutdown — ${dateLabel}`,
    '',
    'Day in review:',
    result.day_in_review,
    '',
    "Tomorrow's top 3:",
    ...(result.top_3 || []).map((t, i) => `${i + 1}. ${t}`),
    '',
    'Shutdown sentence:',
    result.shutdown_sentence,
    result.pattern_note ? `\nPattern: ${result.pattern_note}` : '',
  ].join('\n');

  const top3Text = (result.top_3 || []).map((t, i) => `${i + 1}. ${t}`).join('\n');

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: '14px', flexWrap: 'wrap', gap: '8px',
      }}>
        <div style={{ fontSize: '15px', fontWeight: '600', color: T.text }}>
          {readOnly ? formatDateLong(dateLabel) : 'The day is closed.'}
        </div>
        <CopyBtn text={copyAll} label="Copy all" />
      </div>

      <OutputCard title="Day in review" accent={T.accent} copyText={result.day_in_review}>
        <div style={{ fontSize: '15px', lineHeight: '1.6', color: T.text, whiteSpace: 'pre-wrap' }}>
          {result.day_in_review}
        </div>
      </OutputCard>

      <OutputCard title="Tomorrow's top 3" accent={T.green} copyText={top3Text}>
        <ol style={{
          margin: 0, padding: '0 0 0 18px',
          fontSize: '15px', lineHeight: '1.7', color: T.text,
        }}>
          {(result.top_3 || []).map((t, i) => (
            <li key={i} style={{ marginBottom: '4px' }}>{t}</li>
          ))}
        </ol>
      </OutputCard>

      <OutputCard title="Shutdown sentence" accent={T.amber} copyText={result.shutdown_sentence}>
        <div style={{
          fontSize: '17px', lineHeight: '1.5', color: T.text,
          fontWeight: '500', fontStyle: 'italic',
        }}>
          {result.shutdown_sentence}
        </div>
      </OutputCard>

      {result.pattern_note && (
        <OutputCard title="Pattern note" accent={T.purple} copyText={result.pattern_note}>
          <div style={{ fontSize: '14px', lineHeight: '1.6', color: T.textBody }}>
            {result.pattern_note}
          </div>
        </OutputCard>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  energy: 3,
  done: '',
  stuck: '',
  win: '',
  looming: '',
};

export default function DailyShutdown() {
  const [history, setHistory] = useState(() => trimOldHistory(loadLS(STORAGE_KEY_HISTORY, [])));
  const [form, setForm] = useState(() => loadLS(STORAGE_KEY_DRAFT, EMPTY_FORM));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewKey, setViewKey] = useState(null); // null = today, otherwise a date string from history

  useEffect(() => { saveLS(STORAGE_KEY_DRAFT, form); }, [form]);
  useEffect(() => { saveLS(STORAGE_KEY_HISTORY, history); }, [history]);

  const update = patch => setForm(f => ({ ...f, ...patch }));

  const today = todayKey();
  const todayEntry = history.find(h => h.date === today) || null;
  const viewEntry = viewKey ? history.find(h => h.date === viewKey) : null;

  // Decide what to show: a selected historical entry, today's saved entry, or the form.
  const showingHistorical = !!viewEntry && viewKey !== today;
  const showingTodaysResult = !showingHistorical && !!todayEntry;
  const showingForm = !showingHistorical && !showingTodaysResult;

  const generate = async () => {
    if (loading) return;
    if (!form.done.trim()) { setError('"What got done" is required.'); return; }
    setError(''); setLoading(true);

    try {
      const recent = history.slice(0, PATTERN_WINDOW).map(h => ({
        date: h.date,
        energy: h.energy,
        top_3: h.result?.top_3 || [],
        biggest_win: h.biggest_win || '',
        stuck: h.form?.stuck || '',
      }));

      const userMessage = [
        `Date: ${today}`,
        `Energy today (1=wrecked, 5=peak): ${form.energy}`,
        `What got done:\n${form.done.trim()}`,
        form.stuck.trim() ? `What's stuck:\n${form.stuck.trim()}` : '',
        form.win.trim() ? `Biggest win: ${form.win.trim()}` : '',
        form.looming.trim() ? `Looming for tomorrow:\n${form.looming.trim()}` : '',
        '',
        `Last ${PATTERN_WINDOW} entries (for pattern detection — only mention a pattern if it is clear and useful):`,
        JSON.stringify(recent, null, 2),
      ].filter(Boolean).join('\n\n');

      const res = await callClaude({
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
        max_tokens: 1500,
      });

      const parsed = parseJSON(extractText(res));
      if (!parsed || !parsed.day_in_review || !Array.isArray(parsed.top_3) || !parsed.shutdown_sentence) {
        throw new Error('Response was missing required fields.');
      }
      // Force top_3 to exactly 3 items if the model deviates.
      parsed.top_3 = parsed.top_3.slice(0, 3);

      const entry = {
        date: today,
        energy: form.energy,
        biggest_win: form.win.trim(),
        form: { ...form },
        result: parsed,
        createdAt: new Date().toISOString(),
      };

      setHistory(prev => {
        const without = prev.filter(h => h.date !== today);
        return trimOldHistory([entry, ...without].sort((a, b) => b.date.localeCompare(a.date)));
      });
      setViewKey(null);
      // Clear the draft now that it's been saved.
      setForm(EMPTY_FORM);
    } catch (err) {
      console.error(err);
      setError(err.message === 'SESSION_EXPIRED' ? 'Session expired. Refresh and sign in again.' : (err.message || 'Generation failed.'));
    } finally {
      setLoading(false);
    }
  };

  const startOver = () => {
    // Lets user re-run today (overwrites existing entry on next save).
    setViewKey(null);
    if (todayEntry) setForm(todayEntry.form || EMPTY_FORM);
  };

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '40px 24px 80px' }}>
      <HistoryDrawer
        history={history}
        open={drawerOpen}
        onToggle={() => setDrawerOpen(o => !o)}
        onSelect={(key) => { setViewKey(key === today ? null : key); setDrawerOpen(false); }}
        selectedKey={viewKey || today}
      />

      <StreakHeader history={history} />

      {showingHistorical && (
        <>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '14px',
          }}>
            <div style={{
              fontSize: '11px', fontWeight: '600', color: T.textFaint,
              letterSpacing: '0.5px', textTransform: 'uppercase', fontFamily: fonts.mono,
            }}>Read-only · past shutdown</div>
            <button onClick={() => setViewKey(null)} style={{
              background: T.surfaceAlt, border: `1px solid ${T.border}`, color: T.textDim,
              padding: '6px 12px', fontSize: '12px', fontFamily: fonts.body, borderRadius: '8px',
              cursor: 'pointer', fontWeight: '500',
            }}>Back to today</button>
          </div>
          <ShutdownOutput result={viewEntry.result} dateLabel={viewEntry.date} readOnly />
        </>
      )}

      {showingTodaysResult && (
        <>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '14px',
          }}>
            <div style={{
              fontSize: '11px', fontWeight: '600', color: T.green,
              letterSpacing: '0.5px', textTransform: 'uppercase', fontFamily: fonts.mono,
            }}>Today · shutdown complete</div>
            <button onClick={startOver} style={{
              background: T.surfaceAlt, border: `1px solid ${T.border}`, color: T.textDim,
              padding: '6px 12px', fontSize: '12px', fontFamily: fonts.body, borderRadius: '8px',
              cursor: 'pointer', fontWeight: '500',
            }}>Redo today</button>
          </div>
          <ShutdownOutput result={todayEntry.result} dateLabel={today} />
        </>
      )}

      {showingForm && (
        <>
          <SectionCard title="Energy today" subtitle="1 = wrecked  ·  5 = peak">
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {ENERGY_LEVELS.map(lvl => {
                const active = form.energy === lvl.value;
                return (
                  <button key={lvl.value} type="button" onClick={() => update({ energy: lvl.value })} style={{
                    flex: 1, minWidth: '70px',
                    padding: '12px 8px',
                    background: active ? T.accent : T.surfaceAlt,
                    color: active ? T.textInverse : T.textDim,
                    border: `1px solid ${active ? T.accent : T.border}`,
                    borderRadius: '10px', cursor: 'pointer',
                    fontFamily: fonts.body, fontWeight: '600',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                  }}>
                    <span style={{ fontSize: '18px' }}>{lvl.value}</span>
                    <span style={{ fontSize: '11px', fontWeight: '400', opacity: 0.85 }}>{lvl.label}</span>
                  </button>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title="What got done">
            <Textarea
              value={form.done}
              onChange={v => update({ done: v })}
              placeholder="Quick list. Bullets, fragments, whatever — Claude reads them."
              minHeight="110px"
            />
          </SectionCard>

          <SectionCard title="What's stuck" subtitle="optional">
            <Textarea
              value={form.stuck}
              onChange={v => update({ stuck: v })}
              placeholder="What didn't move and why?"
            />
          </SectionCard>

          <SectionCard title="Biggest win" subtitle="optional">
            <input
              type="text"
              value={form.win}
              onChange={e => update({ win: e.target.value })}
              placeholder="One specific thing that landed today."
              style={{
                width: '100%', padding: '12px 14px',
                background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: '10px',
                fontSize: '14px', fontFamily: fonts.body, color: T.text,
              }}
            />
          </SectionCard>

          <SectionCard title="Looming for tomorrow" subtitle="optional">
            <Textarea
              value={form.looming}
              onChange={v => update({ looming: v })}
              placeholder="Anything you don't want to forget overnight."
            />
          </SectionCard>

          {error && (
            <div style={{
              background: T.redDim, border: `1px solid ${T.redBorder}`, color: T.red,
              padding: '12px 14px', borderRadius: '10px', marginBottom: '14px',
              fontSize: '13px', fontFamily: fonts.body,
            }}>{error}</div>
          )}

          <button onClick={generate} disabled={loading || !form.done.trim()} style={{
            width: '100%', padding: '16px',
            fontSize: '15px', fontWeight: '600',
            background: loading || !form.done.trim() ? T.textFaint : T.text,
            color: T.textInverse,
            border: 'none', borderRadius: '12px',
            cursor: loading ? 'wait' : (form.done.trim() ? 'pointer' : 'not-allowed'),
            fontFamily: fonts.body, transition: 'background 0.15s',
          }}>
            {loading ? 'Closing the day…' : 'Shut down the day'}
          </button>
        </>
      )}
    </div>
  );
}
