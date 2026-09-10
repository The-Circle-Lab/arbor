import type { MigrationBuilder } from 'node-pg-migrate'

// Check-ins become scheduled rather than self-paced: each course gets two
// fixed date/times (one per check-in cycle), set only via direct DB write
// (never exposed in any UI, student or instructor). Nullable with no
// default — a team whose course has a NULL value (or no course at all)
// simply never gets that cycle's check-in triggered, which is the intended
// "invisible unless an admin sets it" behavior.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE courses ADD COLUMN checkin_1_at TIMESTAMPTZ;
    ALTER TABLE courses ADD COLUMN checkin_2_at TIMESTAMPTZ;
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE courses DROP COLUMN IF EXISTS checkin_2_at;
    ALTER TABLE courses DROP COLUMN IF EXISTS checkin_1_at;
  `)
}
