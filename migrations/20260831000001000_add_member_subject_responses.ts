import type { MigrationBuilder } from 'node-pg-migrate'

// New home for the reflect wizard's "Subject" step (personal_goal, position,
// voice, plus their _other free-text variants) now that Subject is no longer
// a shared CHAT component. A single JSONB blob, matching the existing
// convention of individual_reflections.response_data / reveal_ai.per_component,
// keeps the new /api/reflections/subject endpoint a straight passthrough of
// whatever the wizard collected.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE members ADD COLUMN IF NOT EXISTS subject_responses JSONB NOT NULL DEFAULT '{}'::jsonb;
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE members DROP COLUMN IF EXISTS subject_responses;
  `)
}
