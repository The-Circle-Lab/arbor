import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { CHAT_COMPONENTS } from '@/lib/chat-components'
import { requireOwnedMember, requireTeamMemberByTeamId } from '@/lib/auth/team-access'
import { getTeamStatus } from '@/lib/phase'
import { getCheckinAccess } from '@/lib/checkin-schedule'

export async function POST(req: Request) {
  const { memberId, cycleNumber, responses } = await req.json()

  const owned = await requireOwnedMember(memberId)
  if (!owned) return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })

  const status = await getTeamStatus(owned.teamId)
  const access = await getCheckinAccess(owned.teamId, status)
  if (access.mode !== 'active' || access.activeCycle !== cycleNumber) {
    return NextResponse.json({ error: 'Check-ins are not open for this cycle right now' }, { status: 403 })
  }

  for (const component of CHAT_COMPONENTS) {
    if (!responses[component]) continue
    await query(
      `INSERT INTO checkins (member_id, cycle_number, component, response_data)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (member_id, cycle_number, component) DO UPDATE
         SET response_data = $4, submitted_at = NOW()`,
      [memberId, cycleNumber, component, JSON.stringify(responses[component])]
    )
  }

  return NextResponse.json({ ok: true })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const teamId = searchParams.get('teamId')
  const cycle = searchParams.get('cycle')
  if (!teamId || !cycle) return NextResponse.json({ error: 'teamId and cycle required' }, { status: 400 })

  const membership = await requireTeamMemberByTeamId(teamId)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const checkins = await query<{
    member_id: string
    display_name: string
    component: string
    response_data: Record<string, unknown>
  }>(
    `SELECT ci.member_id, u.display_name, ci.component, ci.response_data
     FROM checkins ci
     JOIN members m ON m.id = ci.member_id
     JOIN users u ON u.id = m.user_id
     WHERE m.team_id = $1 AND ci.cycle_number = $2
     ORDER BY m.joined_at`,
    [teamId, cycle]
  )

  return NextResponse.json({ checkins })
}
