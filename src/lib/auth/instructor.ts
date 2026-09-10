import { validate as isUuid } from 'uuid'
import { queryOne } from '@/lib/db'
import { requireUser } from './jwt'

export async function requireInstructor(): Promise<string | null> {
  const userId = await requireUser()
  if (!userId) return null

  const row = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId])
  if (!row || row.role !== 'instructor') return null

  return userId
}

export async function requireCourseOwner(courseId: string): Promise<string | null> {
  if (!isUuid(courseId)) return null

  const userId = await requireInstructor()
  if (!userId) return null

  const row = await queryOne<{ id: string }>(
    'SELECT id FROM courses WHERE id = $1 AND instructor_id = $2 AND deleted_at IS NULL',
    [courseId, userId]
  )
  if (!row) return null

  return userId
}

// Any instructor with a course_instructors row for this course (owner or
// added), on a course that hasn't been soft-deleted. This is the "any
// instructor on the course" check (view, add instructor) — as opposed to
// requireCourseOwner, which stays owner-only.
export async function requireCourseAccess(courseId: string): Promise<string | null> {
  if (!isUuid(courseId)) return null

  const userId = await requireInstructor()
  if (!userId) return null

  const row = await queryOne<{ id: string }>(
    `SELECT c.id
     FROM courses c
     JOIN course_instructors ci ON ci.course_id = c.id
     WHERE c.id = $1 AND ci.user_id = $2 AND c.deleted_at IS NULL`,
    [courseId, userId]
  )
  if (!row) return null

  return userId
}

export interface InstructorTeamAccess {
  userId: string
  teamId: string
  courseId: string
}

// Course-less legacy teams never match this join — the intended
// backward-compatible deny for teams created before the course model existed.
export async function requireInstructorTeam(teamId: string): Promise<InstructorTeamAccess | null> {
  if (!isUuid(teamId)) return null

  const userId = await requireInstructor()
  if (!userId) return null

  const row = await queryOne<{ team_id: string; course_id: string }>(
    `SELECT t.id AS team_id, c.id AS course_id
     FROM teams t
     JOIN courses c ON c.id = t.course_id
     JOIN course_instructors ci ON ci.course_id = c.id
     WHERE t.id = $1 AND ci.user_id = $2 AND c.deleted_at IS NULL`,
    [teamId, userId]
  )
  if (!row) return null

  return { userId, teamId: row.team_id, courseId: row.course_id }
}
