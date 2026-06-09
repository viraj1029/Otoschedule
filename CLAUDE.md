# Otoschedule — CLAUDE.md

## Project Overview

OTO Call Scheduler is a Next.js web app for managing residency call schedules at UTSW (University of Texas Southwestern). It automates CUH/PMH block call assignments for medical residents across multiple hospitals (CMC, VA, Research), respecting rotation assignments, vacation/weekend requests, and fairness constraints.

## Tech Stack

- **Framework**: Next.js 15 (App Router), React 19, TypeScript 5
- **Database**: Vercel Postgres (`@vercel/postgres` SQL tag)
- **Auth**: `iron-session` (encrypted cookies) — password for chief, PIN for residents
- **Password hashing**: `bcryptjs`
- **Deployment**: Vercel (primary); Railway/Render/Fly.io supported

## Local Development

```bash
npm install
# Copy and fill in env vars
cp .env.local.example .env.local
npm run dev          # localhost:3000
npm run migrate      # Run DB migrations manually
npm run build        # Production build
npm start            # Start production server
```

Required env vars:
- `POSTGRES_URL` — Vercel Postgres connection string (auto-injected on Vercel)
- `SESSION_SECRET` — Long random string for session encryption

## Directory Structure

```
src/
├── app/
│   ├── api/               # REST API routes (Next.js route handlers)
│   │   ├── auth/          # chief, resident, me, signout
│   │   ├── block/         # Block config + publish
│   │   ├── residents/     # Resident CRUD + rotations
│   │   ├── requests/      # Vacation/weekend requests
│   │   ├── schedule/      # Generate + retrieve active schedule
│   │   ├── schedules/     # List all + manage by ID
│   │   ├── rotations/     # Rotation segment management
│   │   └── jr-carry/      # Junior carryover hours
│   ├── page.tsx           # Root page (renders <App />)
│   ├── layout.tsx         # HTML shell
│   └── globals.css        # Global dark theme (Syne + Inter fonts)
├── components/
│   ├── App.tsx            # Main state container + api() helper
│   ├── LoginGate.tsx      # Auth UI
│   ├── TopBar.tsx         # Nav bar
│   ├── Toast.tsx          # Notifications
│   ├── steps/             # 4-step workflow UI
│   │   ├── BlockSetup.tsx      # Step 1: block config, add residents
│   │   ├── Requests.tsx        # Step 2: request calendar
│   │   ├── Generate.tsx        # Step 3: schedule generation
│   │   ├── ScheduleView.tsx    # Step 4: CUH/PMH schedule view
│   │   ├── CMCScheduleView.tsx
│   │   └── VAScheduleView.tsx
│   └── modals/
│       ├── AddResidentModal.tsx
│       ├── EditResidentModal.tsx
│       ├── OverrideModal.tsx
│       └── PinDisplayModal.tsx
├── lib/
│   ├── db.ts           # Exports `sql` template tag from @vercel/postgres
│   ├── session.ts      # iron-session config
│   ├── scheduler.ts    # Core scheduling algorithm (~1029 lines)
│   ├── init-db.ts      # DB init + idempotent migrations (~211 lines)
│   └── schema.sql      # Reference schema
└── types/
    └── index.ts        # All shared TypeScript types
scripts/
└── migrate.ts          # CLI migration runner
```

## Architecture Notes

### Authentication & Roles
- **Chief**: Full access — block setup, resident management, schedule generation, publishing
- **Resident**: PIN-authenticated, read-only — own requests + published schedules
- Sessions use httpOnly SameSite encrypted cookies via iron-session

### State Management
Client-side React hooks only (`useState`, `useCallback`, `useEffect`). No Redux/Zustand. The `api<T>()` helper in `App.tsx` wraps all fetch calls.

### Database
- Vercel Postgres with the `sql` template tag (parameterized — no injection risk)
- Migrations are idempotent and run automatically on first request via `initDb()`
- 9 tables: `blocks`, `residents`, `requests`, `schedules`, `persons`, `rotations`, `jr_carry`, plus join tables

### Scheduling Algorithm (`src/lib/scheduler.ts`)
The core is equity-weighted and conflict-aware:
- **Mon–Thu** (non-holiday): 12-hour shifts (5pm–5am)
- **Fri night + Sunday**: paired 12-hour shifts (same resident covers both)
- **Saturday**: 24-hour shift (separate resident)
- **Holidays**: 24-hour shifts any day
- **Seniors (PGY 4+)**: Weekly rotation blocks, equity-weighted by rotation length; Research residents get 1 dedicated backup week + 1 day
- **Juniors (PGY 1–3)**: Daily assignments with pair logic, CUH rounding assignments
- Vacation cap: 5 weekdays/block (holidays excluded); unlimited weekend-off requests (~7–8 approved/block)
- Trauma weeks: hardcoded 2026 dates for high-acuity tracking

### Multi-Hospital Support
Residents have rotation segments per hospital with date ranges. Supported: CUH, PMH, CMC, VA, Research. CMC and VA have dedicated schedule generation modes.

## Key Patterns

- All SQL uses the `sql` template tag — never string-concatenate queries
- API routes follow Next.js App Router conventions (`route.ts` files)
- Component files are large and self-contained (co-locate state + UI)
- No external UI component library — all custom CSS
- `xlsx` package is available for Excel export

## Common Tasks

### Add a new API endpoint
Create `src/app/api/<name>/route.ts`. Import `sql` from `@/lib/db`, `getSession` from `@/lib/session`. Check `role` from session for access control.

### Add a new DB table
Add `CREATE TABLE IF NOT EXISTS` in `src/lib/init-db.ts` inside the `initDb()` function. It will run on next request. Also update `src/lib/schema.sql` as reference.

### Add a new resident field
1. Add column to `init-db.ts` migration
2. Update `src/types/index.ts`
3. Update relevant API routes (`residents/`, `residents/[id]/`)
4. Update `AddResidentModal.tsx` / `EditResidentModal.tsx`

### Modify the scheduling logic
All logic is in `src/lib/scheduler.ts`. The main export is `generateSchedule(block, residents, requests)`. Trauma week dates for 2026 are hardcoded near the top.
