import type { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE instructor_summaries (
      team_id       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      cycle_number  SMALLINT NOT NULL CHECK (cycle_number IN (1, 2)),
      summary       TEXT NOT NULL,
      watch_points  JSONB NOT NULL DEFAULT '[]'::jsonb,
      generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (team_id, cycle_number)
    );
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE IF EXISTS instructor_summaries;
  `)
}
