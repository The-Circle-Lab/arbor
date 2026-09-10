import { validate as isUuid } from 'uuid'
import { queryOne } from '@/lib/db'
import { requireUser } from './jwt'

// Fully separate from src/lib/auth/instructor.ts by design — a researcher
// can read every course in the system, not just ones they're attached to
// via course_instructors, so these checks don't join through that table.
export async function requireResearcher(): Promise<string | null> {
  const userId = await requireUser()
  if (!userId) return null

  const row = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId])
  if (!row || row.role !== 'researcher') return null

  return userId
}

// No course_instructors join — a researcher can read any course that exists.
export async function requireResearcherCourse(courseId: string): Promise<string | null> {
  if (!isUuid(courseId)) return null

  const userId = await requireResearcher()
  if (!userId) return null

  const row = await queryOne<{ id: string }>(
    'SELECT id FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  )
  if (!row) return null

  return userId
}

export interface ResearcherTeamAccess {
  userId: string
  teamId: string
  courseId: string
}

export async function requireResearcherTeam(teamId: string): Promise<ResearcherTeamAccess | null> {
  if (!isUuid(teamId)) return null

  const userId = await requireResearcher()
  if (!userId) return null

  const row = await queryOne<{ team_id: string; course_id: string }>(
    `SELECT t.id AS team_id, c.id AS course_id
     FROM teams t
     JOIN courses c ON c.id = t.course_id
     WHERE t.id = $1 AND c.deleted_at IS NULL`,
    [teamId]
  )
  if (!row) return null

  return { userId, teamId: row.team_id, courseId: row.course_id }
}
