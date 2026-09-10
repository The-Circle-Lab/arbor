import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { getTeamStatus } from '@/lib/phase'
import { getCurrentPlantState } from '@/lib/plant-health'
import { requireTeamMember } from '@/lib/auth/team-access'
import { getTeamMembers } from '@/lib/team-members'
import { getCheckinAccess } from '@/lib/checkin-schedule'

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const membership = await requireTeamMember(code)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const team = await queryOne<{ id: string; name: string; join_code: string; project_title: string | null; deadline: string | null; assignment_brief: string | null; plant_type: string | null; plant_votes: Record<string, string> | null; project_manager_id: string | null; project_manager_votes: Record<string, string> | null }>(
    'SELECT id, name, join_code, project_title, deadline, assignment_brief, plant_type, plant_votes, project_manager_id, project_manager_votes FROM teams WHERE join_code = $1',
    [code.toUpperCase()]
  )
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const members = await getTeamMembers(team.id)

  const [status, plant_state] = await Promise.all([
    getTeamStatus(team.id),
    getCurrentPlantState(team.id),
  ])
  const checkinAccess = await getCheckinAccess(team.id, status)

  return NextResponse.json({ ...team, members, status, plant_state, checkinAccess })
}
