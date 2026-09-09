import type { MigrationBuilder } from 'node-pg-migrate'

// Causal-clause cache for MEDIUM-level facilitation instructions: reveal_ai
// (initial pass) and plant_states (check-in re-flags, cycle 1/2). NOT reusing
// plant_states.ai_nudge_text — that column is dead (always written NULL by
// /api/plant/[code]/[cycle]/route.ts, tied to the unused generateCheckinNudge
// bullet-list feature, and a different shape: bullets vs. one clause/component).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE reveal_ai ADD COLUMN IF NOT EXISTS split_reasons JSONB;
    ALTER TABLE plant_states ADD COLUMN IF NOT EXISTS split_reasons JSONB;
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE reveal_ai DROP COLUMN IF EXISTS split_reasons;
    ALTER TABLE plant_states DROP COLUMN IF EXISTS split_reasons;
  `)
}
