/**
 * Migration script — run once to create tables in your Vercel Postgres database.
 * Usage: npm run migrate
 *
 * Make sure POSTGRES_URL is set in your .env.local before running.
 */
import { sql } from '@vercel/postgres';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local for local runs
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  console.log('Running OTO Scheduler migrations...\n');

  await sql`
    CREATE TABLE IF NOT EXISTS blocks (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      start_date    TEXT NOT NULL,
      end_date      TEXT NOT NULL,
      chief_password TEXT NOT NULL,
      published     BOOLEAN DEFAULT FALSE,
      created_at    TIMESTAMP DEFAULT NOW()
    )
  `;
  console.log('✓ blocks table');

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
  console.log('✓ residents table');

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
  console.log('✓ requests table');

  await sql`
    CREATE TABLE IF NOT EXISTS schedules (
      id           TEXT PRIMARY KEY,
      block_id     TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
      generated_at TIMESTAMP DEFAULT NOW(),
      data         TEXT NOT NULL
    )
  `;
  console.log('✓ schedules table');

  console.log('\nMigration complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
