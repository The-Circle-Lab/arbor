import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { requireInstructorTeam } from '@/lib/auth/instructor'
import { getTeamStatus } from '@/lib/phase'
import { getTeamMembers } from '@/lib/team-members'

// Not in the original plan's endpoint list — added because the group-detail
// page's header (team name, project title, plant type for PlantVisual) has
// no other source once navigation only carries a teamId. Mirrors
// src/app/api/teams/[code]/route.ts's shape (team + members + status), scoped
// by instructor auth instead of team membership.
export async function GET(_req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await params
    const access = await requireInstructorTeam(teamId)
    if (!access) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const team = await queryOne<{ id: string; name: string; join_code: string; project_title: string | null; deadline: string | null; plant_type: string | null; project_manager_id: string | null }>(
      'SELECT id, name, join_code, project_title, deadline, plant_type, project_manager_id FROM teams WHERE id = $1',
      [teamId]
    )
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

    const members = await getTeamMembers(teamId)

    const status = await getTeamStatus(teamId)

    return NextResponse.json({ ...team, members, status })
  } catch (e) {
    console.error('GET /api/instructor/teams/[teamId] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
