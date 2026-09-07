import type { MigrationBuilder } from 'node-pg-migrate'

// Team-level aggregation of the per-member scores computed by
// subject-scoring.ts's computeSubjectScores. position_spread, voice_denominator
// and voice_below_v4 feed the low/medium/high level classification in
// computeTeamSubjectLevel. No recompute is wired up yet (no trigger, no call
// site) and existing teams are not backfilled — these columns just hold the
// defaults until that wiring lands separately.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE teams
      ADD COLUMN IF NOT EXISTS position_spread INTEGER,
      ADD COLUMN IF NOT EXISTS voice_denominator INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS voice_below_v4 INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'low' CHECK (level IN ('low', 'medium', 'high'));
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE teams
      DROP COLUMN IF EXISTS position_spread,
      DROP COLUMN IF EXISTS voice_denominator,
      DROP COLUMN IF EXISTS voice_below_v4,
      DROP COLUMN IF EXISTS level;
  `)
}
