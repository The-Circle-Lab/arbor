import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireInstructorTeam } from '@/lib/auth/instructor'
import { getCurrentPlantState, type PlantHealthSource } from '@/lib/plant-health'

// Direct data source for the health-over-time chart.
export async function GET(_req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await params
    const access = await requireInstructorTeam(teamId)
    if (!access) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const events = await query<{
      id: string
      occurred_at: string
      level: number
      delta: number
      source: PlantHealthSource
      cycle_number: number | null
    }>(
      // id is a tiebreaker so a batch insert sharing one occurred_at still
      // yields a deterministic "latest" event (see also
      // src/app/api/courses/[courseId]/teams/route.ts and
      // src/lib/plant-health.ts, which order the same way).
      'SELECT id, occurred_at, level, delta, source, cycle_number FROM plant_health_events WHERE team_id = $1 ORDER BY occurred_at ASC, id ASC',
      [teamId]
    )

    const currentState = await getCurrentPlantState(teamId)

    return NextResponse.json({ events, currentState })
  } catch (e) {
    console.error('GET /api/instructor/teams/[teamId]/health error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
