import { sql } from '@vercel/postgres';
import { randomUUID } from 'crypto';

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

  // Global person accounts — one row per real person, persists across blocks.
  await sql`
    CREATE TABLE IF NOT EXISTS persons (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      pgy        INTEGER NOT NULL,
      pin        TEXT NOT NULL,
      color      TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
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

  // Idempotent column migrations
  await sql`ALTER TABLE residents ADD COLUMN IF NOT EXISTS rotation_start TEXT`;
  await sql`ALTER TABLE residents ADD COLUMN IF NOT EXISTS rotation_end   TEXT`;
  await sql`ALTER TABLE residents ADD COLUMN IF NOT EXISTS person_id TEXT REFERENCES persons(id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS schedules (
      id           TEXT PRIMARY KEY,
      block_id     TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
      generated_at TIMESTAMP DEFAULT NOW(),
      data         TEXT NOT NULL
    )
  `;

  // Migrate existing residents that have no person_id yet.
  // For each unlinked resident, create a persons row and link it.
  const { rows: unlinked } = await sql`SELECT * FROM residents WHERE person_id IS NULL`;
  for (const r of unlinked) {
    const personId = 'per_' + randomUUID().replace(/-/g, '').slice(0, 8);
    await sql`
      INSERT INTO persons (id, name, pgy, pin, color)
      VALUES (${personId}, ${r.name}, ${r.pgy as number}, ${r.pin}, ${r.color})
    `;
    await sql`UPDATE residents SET person_id = ${personId} WHERE id = ${r.id}`;
  }
}
