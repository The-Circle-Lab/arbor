import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireInstructorTeam } from '@/lib/auth/instructor'

// Drives the cycle-tab UI on the group-detail page — empty array means "no
// check-in data yet."
export async function GET(_req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await params
    const access = await requireInstructorTeam(teamId)
    if (!access) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const rows = await query<{ cycle_number: number }>(
      'SELECT DISTINCT cycle_number FROM plant_states WHERE team_id = $1 ORDER BY cycle_number',
      [teamId]
    )

    return NextResponse.json({ availableCycles: rows.map(r => r.cycle_number) })
  } catch (e) {
    console.error('GET /api/instructor/teams/[teamId]/cycles error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
