-- OTO Scheduler — Postgres schema
-- Run via: npm run migrate

CREATE TABLE IF NOT EXISTS blocks (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  chief_password TEXT NOT NULL,
  published   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS residents (
  id          TEXT PRIMARY KEY,
  block_id    TEXT NOT NULL,
  name        TEXT NOT NULL,
  pgy         INTEGER NOT NULL,
  hospital    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  pin         TEXT NOT NULL,
  color       TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  FOREIGN KEY (block_id) REFERENCES blocks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS requests (
  id          TEXT PRIMARY KEY,
  resident_id TEXT NOT NULL,
  block_id    TEXT NOT NULL,
  date        TEXT NOT NULL,
  type        TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE (resident_id, date, type),
  FOREIGN KEY (resident_id) REFERENCES residents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS schedules (
  id          TEXT PRIMARY KEY,
  block_id    TEXT NOT NULL,
  generated_at TIMESTAMP DEFAULT NOW(),
  data        TEXT NOT NULL,
  FOREIGN KEY (block_id) REFERENCES blocks(id) ON DELETE CASCADE
);
