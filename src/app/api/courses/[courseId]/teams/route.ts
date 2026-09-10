import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireCourseOwner } from '@/lib/auth/instructor'
import { levelToState, DEFAULT_LEVEL } from '@/lib/plant-health'

export async function GET(_req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  try {
    const { courseId } = await params
    const userId = await requireCourseOwner(courseId)
    if (!userId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const rows = await query<{
      id: string
      name: string
      join_code: string
      project_title: string | null
      deadline: string | null
      plant_type: string | null
      stage: number
      level: number | null
    }>(
      `WITH latest_events AS (
         SELECT DISTINCT ON (team_id) team_id, level
         FROM plant_health_events
         WHERE team_id IN (SELECT id FROM teams WHERE course_id = $1)
         ORDER BY team_id, occurred_at DESC, id DESC
       )
       SELECT t.id, t.name, t.join_code, t.project_title, t.deadline, t.plant_type, t.stage, le.level
       FROM teams t
       LEFT JOIN latest_events le ON le.team_id = t.id
       WHERE t.course_id = $1
       ORDER BY t.name`,
      [courseId]
    )

    const teams = rows.map(row => ({
      id: row.id,
      name: row.name,
      joinCode: row.join_code,
      projectTitle: row.project_title,
      deadline: row.deadline,
      plantType: row.plant_type,
      stage: row.stage,
      state: levelToState(row.level ?? DEFAULT_LEVEL),
    }))

    return NextResponse.json({ teams })
  } catch (e) {
    console.error('GET /api/courses/[courseId]/teams error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
