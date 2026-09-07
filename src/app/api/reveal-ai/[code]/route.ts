export const maxDuration = 60

import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { generateRevealComparison, MemberReflection } from '@/lib/ai'
import { ChatComponent } from '@/lib/chat-components'
import { requireTeamMember } from '@/lib/auth/team-access'
import { refreshTeamEngagementLevel } from '@/lib/subject-scoring'

export async function POST(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const membership = await requireTeamMember(code)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const teamId = membership.teamId

  // Return cached result if exists
  const cached = await queryOne<{ per_component: Record<ChatComponent, string>; flagged_components: string[] }>(
    'SELECT per_component, flagged_components FROM reveal_ai WHERE team_id = $1',
    [teamId]
  )
  if (cached) return NextResponse.json(cached)

  // Build member reflections
  const reflections = await query<{
    member_id: string
    display_name: string
    component: string
    response_data: Record<string, unknown>
  }>(
    `SELECT ir.member_id, u.display_name, ir.component, ir.response_data
     FROM individual_reflections ir
     JOIN members m ON m.id = ir.member_id
     JOIN users u ON u.id = m.user_id
     WHERE m.team_id = $1
     ORDER BY m.joined_at`,
    [teamId]
  )

  // Group by member
  const memberMap = new Map<string, MemberReflection>()
  for (const row of reflections) {
    if (!memberMap.has(row.member_id)) {
      memberMap.set(row.member_id, { displayName: row.display_name, responses: {} as MemberReflection['responses'] })
    }
    memberMap.get(row.member_id)!.responses[row.component as ChatComponent] = row.response_data
  }

  const members = Array.from(memberMap.values())
  const result = await generateRevealComparison(members)

  await query(
    `INSERT INTO reveal_ai (team_id, per_component, flagged_components)
     VALUES ($1, $2, $3)
     ON CONFLICT (team_id) DO NOTHING`,
    [teamId, JSON.stringify(result.perComponent), result.flaggedComponents]
  )

  await refreshTeamEngagementLevel(teamId)

  return NextResponse.json({
    per_component: result.perComponent,
    flagged_components: result.flaggedComponents,
  })
}

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const membership = await requireTeamMember(code)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const cached = await queryOne<{ per_component: Record<ChatComponent, string>; flagged_components: string[] }>(
    'SELECT per_component, flagged_components FROM reveal_ai WHERE team_id = $1',
    [membership.teamId]
  )
  if (!cached) return NextResponse.json({ ready: false }, { status: 404 })
  return NextResponse.json(cached)
}
