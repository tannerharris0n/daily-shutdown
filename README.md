# Daily Shutdown

> 60-second end-of-day ritual for ADHD-prone makers.

Type a few quick inputs at the end of your workday. Claude reflects the day back, picks tomorrow's top 3, and writes a "shutdown sentence" so your brain stops chewing on work after hours. A streak counter nudges you to keep the habit going.

![placeholder screenshot](./screenshot.png)

## Why this exists

The end of the workday is the hardest moment for an ADHD brain. The day's residue follows you to dinner, to the couch, to bed. You ruminate on what didn't get done. You can't remember where you left off.

Daily Shutdown is a forcing function: five inputs, one button, one minute. Out the other side comes a short reflection, a hard-edged plan for tomorrow, and a single sentence you can say out loud to mentally close the day.

No backend. No accounts. Everything lives in your browser's localStorage.

## Setup

```bash
git clone https://github.com/tannerharrison/daily-shutdown.git
cd daily-shutdown
npm install
cp .env.example .env  # fill in ANTHROPIC_API_KEY (or use in-app key entry)
npm run dev
```

That's it. Visit http://localhost:5173 and run your first shutdown.

### Configuration

The app runs in three modes:

| Mode | When | Setup |
| --- | --- | --- |
| **Open** | Local dev, single-user | Leave `AUTH_PASSWORD` unset |
| **Gated** | Hosted, password-protected | Set `AUTH_PASSWORD` and `SESSION_SECRET` |
| **BYO key** | Forkers without a server-side key | Leave `ANTHROPIC_API_KEY` unset, paste a key in Settings |

```env
# .env
ANTHROPIC_API_KEY=sk-ant-...     # optional if users will paste keys in Settings
AUTH_PASSWORD=                   # set to enable password gate
SESSION_SECRET=                  # required if AUTH_PASSWORD set
PORT=3000
```

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Production build

```bash
npm run build
npm start
# → http://localhost:3000
```

## What it does

**Form** — five quick inputs:

1. Energy today (1–5)
2. What got done (the only required field)
3. What's stuck (optional)
4. Biggest win (optional)
5. Looming for tomorrow (optional)

**Output** — four cards:

1. **Day in review** — 2–3 sentences reflecting the day back, honestly.
2. **Tomorrow's top 3** — three specific, actionable items.
3. **Shutdown sentence** — one concrete sentence to read out loud.
4. **Pattern note** — only when the last 7 days show something worth saying.

**Streak counter** keeps you honest. **History drawer** lets you look back at past shutdowns. **Settings** has an export/import button so your data is yours.

## Tech

- **Vite + React 18** — small, fast, no TypeScript
- **Express** — proxy for the Anthropic API, optional auth gate
- **Anthropic API** — Claude Sonnet 4 (`claude-sonnet-4-20250514`)
- **localStorage only** — no database, no accounts, 90-day rolling history

## Deploy

This repo ships with a `nixpacks.toml` for one-click deploys on Railway, Render, Fly.io, and similar platforms. Set the env vars in your provider's dashboard. The default port is 3000.

## License

MIT. Fork it, change it, host it, charge for it. Just keep the copyright notice.

---

Built by [Tanner Harrison](https://tannerharrison.com) — part of [tools.tannerharrison.com](https://tools.tannerharrison.com).
