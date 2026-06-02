import { sql } from '@vercel/postgres';

let initialized = false;

export async function initDb() {
  if (initialized) return;
  initialized = true;

  await sql`
    CREATE TABLE IF NOT EXISTS blocks (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      start_date     TEXT NOT NULL,
      end_date       TEXT NOT NULL,
      chief_password TEXT NOT NULL,
      published      BOOLEAN DEFAULT FALSE,
      created_at     TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS residents (
      id          TEXT PRIMARY KEY,
      block_id    TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      pgy         INTEGER NOT NULL,
      hospital    TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'active',
      pin         TEXT NOT NULL,
      color       TEXT NOT NULL,
      sort_order  INTEGER DEFAULT 0
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS requests (
      id          TEXT PRIMARY KEY,
      resident_id TEXT NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
      block_id    TEXT NOT NULL,
      date        TEXT NOT NULL,
      type        TEXT NOT NULL,
      created_at  TIMESTAMP DEFAULT NOW(),
      UNIQUE (resident_id, date, type)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS schedules (
      id           TEXT PRIMARY KEY,
      block_id     TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
      generated_at TIMESTAMP DEFAULT NOW(),
      data         TEXT NOT NULL
    )
  `;
}
