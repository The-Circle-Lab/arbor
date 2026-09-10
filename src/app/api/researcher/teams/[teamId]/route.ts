import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { requireResearcherTeam } from '@/lib/auth/researcher'
import { getTeamStatus } from '@/lib/phase'
import { getTeamMembers } from '@/lib/team-members'

// Mirrors /api/instructor/teams/[teamId] — the group-detail page's header
// (team name, project title, plant type for PlantVisual) has no other
// source once navigation only carries a teamId. Scoped by researcher auth
// instead of course_instructors membership.
export async function GET(_req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await params
    const access = await requireResearcherTeam(teamId)
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
    console.error('GET /api/researcher/teams/[teamId] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
