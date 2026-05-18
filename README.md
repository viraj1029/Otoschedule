# OTO Call Scheduler — UTSW

Residency call scheduling web app for the CUH/PMH rotation block.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# 3. Open in browser
open http://localhost:3000
```

For development with auto-reload:
```bash
npm run dev
```

---

## Default Login

| Role | Credential |
|------|-----------|
| Chief / Admin | Password: `chief2026` |
| Resident | Select name + PIN shown when added |

Change the admin password in **Block Setup → Block Configuration → New Admin Password**.

---

## Project Structure

```
oto-scheduler/
├── package.json
├── README.md
├── data/
│   └── scheduler.db        # SQLite database (auto-created)
├── public/
│   └── index.html          # Full frontend app
└── src/
    ├── server.js            # Express API server
    └── db.js                # SQLite schema + helpers
```

---

## How It Works

### Roles
- **Chief / Admin** — full access: block setup, pool management, request overview, schedule generation, publishing
- **Resident** — PIN-authenticated, sees only their own request calendar + published schedule

### Shift Logic
| Day | Hours |
|-----|-------|
| Mon–Thu (non-holiday) | 12h (5pm–5am) |
| Friday night (non-holiday) | 12h — same resident covers Sunday |
| Saturday | 24h — separate resident from Fri/Sun pair |
| Sunday | 24h — same as Friday |
| Any holiday (any day) | 24h |

### Research Senior
Mark a PGY-4 as **Research** status. They receive:
- 1 backup call week (auto-assigned, avoiding their days off)
- 1 backup weekend day
- Excluded from the regular senior rotation

### Vacation Requests
- Max 5 weekdays per block (holidays don't count toward cap)
- Weekend-off requests: unlimited, ~7–8 approved per block
- Conflicts auto-detected; seniority resolves at generation

---

## Deploying (so residents can access from their own browser)

### Option A — Railway (easiest)
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### Option B — Render
1. Push this folder to a GitHub repo
2. Go to render.com → New Web Service → connect repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Add env var: `SESSION_SECRET=some-random-string`

### Option C — Fly.io
```bash
npm install -g flyctl
fly launch
fly deploy
```

### Persistent Storage Note
The SQLite database (`data/scheduler.db`) lives on the server's filesystem.
On Railway/Render free tiers the filesystem resets on redeploy — add a persistent
volume or switch to a hosted DB (Turso, PlanetScale) if you need data to survive deploys.

For a quick workaround, export the schedule to CSV before any redeploy.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `SESSION_SECRET` | `oto-scheduler-secret-2026` | Session encryption key — change in production |

---

## Handoff to Claude Code

If you want to continue development with Claude Code:

```bash
cd oto-scheduler
claude
```

Suggested first prompt:
> "This is an OTO residency call scheduler. The frontend is in public/index.html, the Express API is in src/server.js, and SQLite is set up in src/db.js. I'd like to [describe what you want next — e.g. add email notifications, ACGME hour tracking, multi-block support, etc.]"
