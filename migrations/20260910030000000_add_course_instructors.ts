import type { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE course_instructors (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id  UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role       TEXT NOT NULL DEFAULT 'instructor' CHECK (role IN ('owner','instructor')),
      added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(course_id, user_id)
    );
    CREATE INDEX idx_course_instructors_course_id ON course_instructors(course_id);
    CREATE INDEX idx_course_instructors_user_id ON course_instructors(user_id);

    INSERT INTO course_instructors (course_id, user_id, role)
    SELECT id, instructor_id, 'owner' FROM courses;
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE IF EXISTS course_instructors;
  `)
}
