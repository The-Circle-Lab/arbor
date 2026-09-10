import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireResearcher } from '@/lib/auth/researcher'

// Every course in the system, no ownership/membership filter — unlike
// /api/courses, which scopes to courses the instructor owns or was added to.
export async function GET() {
  try {
    const userId = await requireResearcher()
    if (!userId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const courses = await query<{
      id: string
      name: string
      join_code: string
      created_at: string
      team_count: number
    }>(
      `SELECT c.id, c.name, c.join_code, c.created_at, COUNT(t.id)::int AS team_count
       FROM courses c
       LEFT JOIN teams t ON t.course_id = c.id
       WHERE c.deleted_at IS NULL
       GROUP BY c.id
       ORDER BY c.created_at`
    )

    return NextResponse.json({ courses })
  } catch (e) {
    console.error('GET /api/researcher/courses error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
