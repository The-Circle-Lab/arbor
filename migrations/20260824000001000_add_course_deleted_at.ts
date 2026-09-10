import type { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE courses ADD COLUMN deleted_at TIMESTAMPTZ;
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE courses DROP COLUMN IF EXISTS deleted_at;
  `)
}
