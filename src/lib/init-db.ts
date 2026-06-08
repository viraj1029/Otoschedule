import { sql } from '@vercel/postgres';
import { randomUUID } from 'crypto';

function rotId() { return 'rot_' + randomUUID().replace(/-/g, '').slice(0, 10); }

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

  // Add named sub-schedule columns (idempotent)
  await sql`ALTER TABLE schedules ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'Schedule'`;
  await sql`ALTER TABLE schedules ADD COLUMN IF NOT EXISTS start_date TEXT`;
  await sql`ALTER TABLE schedules ADD COLUMN IF NOT EXISTS end_date TEXT`;
  await sql`ALTER TABLE schedules ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE schedules ADD COLUMN IF NOT EXISTS schedule_type TEXT`;
  await sql`
    UPDATE schedules
    SET schedule_type = CASE (data::jsonb)->>'type'
      WHEN 'cmc' THEN 'cmc'
      WHEN 'va'  THEN 'va'
      ELSE 'cuh_pmh'
    END
    WHERE schedule_type IS NULL
  `;

  // Backfill the legacy sched_block_main record with block dates and published state
  await sql`
    UPDATE schedules s
    SET name = b.name,
        start_date = b.start_date,
        end_date = b.end_date,
        published = b.published
    FROM blocks b
    WHERE s.block_id = b.id AND s.start_date IS NULL
  `;

  // Per-person carry-over hours across blocks within an academic year (Jul–Jun).
  await sql`
    CREATE TABLE IF NOT EXISTS jr_carry (
      person_id    TEXT NOT NULL,
      block_start  TEXT NOT NULL,
      academic_year INT NOT NULL,
      hours        REAL NOT NULL DEFAULT 0,
      avail_days   INT  NOT NULL DEFAULT 0,
      archived_at  TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (person_id, block_start)
    )
  `;

  // Rotation segments — one row per hospital stint per resident per year.
  await sql`
    CREATE TABLE IF NOT EXISTS rotations (
      id          TEXT PRIMARY KEY,
      resident_id TEXT NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
      hospital    TEXT NOT NULL,
      start_date  TEXT NOT NULL,
      end_date    TEXT NOT NULL
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

  // ── Rotation segment migration ─────────────────────────────────────────────
  // Step 1: For each resident that has rotation_start/rotation_end set, create
  //         a rotation segment if one does not already exist for that resident.
  const { rows: residentsWithDates } = await sql`
    SELECT id, hospital, rotation_start, rotation_end
    FROM residents
    WHERE rotation_start IS NOT NULL OR rotation_end IS NOT NULL
  `;
  for (const r of residentsWithDates) {
    const { rows: existing } = await sql`SELECT id FROM rotations WHERE resident_id = ${r.id}`;
    if (!existing.length) {
      // Get block dates to use as fallback start/end
      const { rows: bRows } = await sql`
        SELECT b.start_date, b.end_date FROM blocks b
        JOIN residents res ON res.block_id = b.id WHERE res.id = ${r.id}
      `;
      const bs = bRows[0]?.start_date as string ?? '2026-07-01';
      const be = bRows[0]?.end_date   as string ?? '2027-06-30';
      await sql`
        INSERT INTO rotations (id, resident_id, hospital, start_date, end_date)
        VALUES (${rotId()}, ${r.id}, ${r.hospital as string}, ${r.rotation_start ?? bs}, ${r.rotation_end ?? be})
      `;
    }
  }

  // Step 2: Merge duplicate resident entries (same person_id + block_id).
  //         Keep the row with the lowest sort_order as primary, move requests,
  //         create rotation segments from duplicates, then delete duplicates.
  const { rows: dupGroups } = await sql`
    SELECT person_id, block_id, COUNT(*) AS cnt
    FROM residents
    WHERE person_id IS NOT NULL
    GROUP BY person_id, block_id
    HAVING COUNT(*) > 1
  `;
  for (const g of dupGroups) {
    const { rows: dupes } = await sql`
      SELECT * FROM residents
      WHERE person_id = ${g.person_id as string} AND block_id = ${g.block_id as string}
      ORDER BY sort_order ASC, id ASC
    `;
    if (dupes.length < 2) continue;
    const primary = dupes[0];
    const others  = dupes.slice(1);
    for (const dup of others) {
      // Create rotation segment from duplicate's data if it has dates
      const { rows: dupRots } = await sql`SELECT id FROM rotations WHERE resident_id = ${dup.id}`;
      if (!dupRots.length) {
        const { rows: bRows } = await sql`
          SELECT start_date, end_date FROM blocks WHERE id = ${dup.block_id as string}
        `;
        const bs = bRows[0]?.start_date as string ?? '2026-07-01';
        const be = bRows[0]?.end_date   as string ?? '2027-06-30';
        await sql`
          INSERT INTO rotations (id, resident_id, hospital, start_date, end_date)
          VALUES (${rotId()}, ${primary.id}, ${dup.hospital as string}, ${dup.rotation_start ?? bs}, ${dup.rotation_end ?? be})
        `;
      } else {
        // Move existing rotation segments to the primary resident
        await sql`UPDATE rotations SET resident_id = ${primary.id} WHERE resident_id = ${dup.id}`;
      }
      // Move requests from duplicate to primary
      await sql`UPDATE requests SET resident_id = ${primary.id} WHERE resident_id = ${dup.id} AND NOT EXISTS (
        SELECT 1 FROM requests r2 WHERE r2.resident_id = ${primary.id} AND r2.date = requests.date AND r2.type = requests.type
      )`;
      await sql`DELETE FROM requests WHERE resident_id = ${dup.id}`;
      // Delete the duplicate resident
      await sql`DELETE FROM residents WHERE id = ${dup.id}`;
    }
  }
}
