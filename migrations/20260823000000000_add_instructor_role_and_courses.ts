import type { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','instructor'));

    CREATE TABLE courses (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name          TEXT NOT NULL,
      join_code     CHAR(6) NOT NULL UNIQUE,
      instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_courses_instructor_id ON courses(instructor_id);

    ALTER TABLE teams ADD COLUMN course_id UUID REFERENCES courses(id) ON DELETE SET NULL;
    CREATE INDEX idx_teams_course_id ON teams(course_id);
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_teams_course_id;
    ALTER TABLE teams DROP COLUMN IF EXISTS course_id;

    DROP INDEX IF EXISTS idx_courses_instructor_id;
    DROP TABLE IF EXISTS courses;

    ALTER TABLE users DROP COLUMN IF EXISTS role;
  `)
}
