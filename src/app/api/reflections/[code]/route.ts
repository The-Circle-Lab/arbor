import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { generateRevealComparison, MemberReflection } from '@/lib/ai'
import { CHAT_COMPONENTS, ChatComponent } from '@/lib/chat-components'
import { requireTeamMember } from '@/lib/auth/team-access'
import { refreshTeamEngagementLevel } from '@/lib/db/subject-scoring'

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const membership = await requireTeamMember(code)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const teamId = membership.teamId

  const team = await queryOne<{ project_title: string | null; deadline: string | null; assignment_brief: string | null }>(
    'SELECT project_title, deadline, assignment_brief FROM teams WHERE id = $1',
    [teamId]
  )

  const [{ team_size }] = await query<{ team_size: number }>(
    'SELECT COUNT(*)::int AS team_size FROM members WHERE team_id = $1',
    [teamId]
  )

  // Count members who submitted all CHAT components
  const submittedRows = await query<{ member_id: string; count: number }>(
    `SELECT ir.member_id, COUNT(DISTINCT ir.component)::int AS count
     FROM individual_reflections ir
     JOIN members m ON m.id = ir.member_id
     WHERE m.team_id = $1
     GROUP BY ir.member_id`,
    [teamId]
  )
  const submitted = submittedRows.filter(r => r.count >= CHAT_COMPONENTS.length).length

  if (submitted < team_size) {
    return NextResponse.json({ ready: false, submitted, teamSize: team_size }, { status: 403 })
  }

  // Return all reflections with member names
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
     ORDER BY m.joined_at, ir.component`,
    [teamId]
  )

  // Kick off AI generation server-side if not already done (fire-and-forget, no await)
  const existing = await queryOne('SELECT id FROM reveal_ai WHERE team_id = $1', [teamId])
  if (!existing) {
    const memberMap = new Map<string, MemberReflection>()
    for (const row of reflections) {
      if (!memberMap.has(row.member_id)) {
        memberMap.set(row.member_id, { displayName: row.display_name, responses: {} as MemberReflection['responses'] })
      }
      memberMap.get(row.member_id)!.responses[row.component as ChatComponent] = row.response_data
    }
    const projectContext = [
      team?.project_title ? `Title: ${team.project_title}` : '',
      team?.deadline ? `Deadline: ${team.deadline}` : '',
      team?.assignment_brief ? `Brief: ${team.assignment_brief}` : '',
    ].filter(Boolean).join('\n') || undefined

    generateRevealComparison(Array.from(memberMap.values()), projectContext)
      .then(result => query(
        `INSERT INTO reveal_ai (team_id, per_component, flagged_components, split_reasons)
         VALUES ($1, $2, $3, $4) ON CONFLICT (team_id) DO NOTHING`,
        [teamId, JSON.stringify(result.perComponent), result.flaggedComponents, JSON.stringify(result.splitReasons)]
      ))
      .then(() => refreshTeamEngagementLevel(teamId))
      .catch(e => console.error('reveal-ai generation error:', e))
  }

  return NextResponse.json({ ready: true, reflections, teamSize: team_size })
}
