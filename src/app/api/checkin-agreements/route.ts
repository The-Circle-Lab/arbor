export const maxDuration = 60

import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { reviseAgreement } from '@/lib/ai'
import { ChatComponent } from '@/lib/chat-components'
import { requireOwnedMember, isProjectManager } from '@/lib/auth/team-access'
import { clearAgreementApprovals } from '@/lib/agreement-approvals'
import { logClauseAuthored } from '@/lib/component-flow-events'

// POST: revise a flagged component's agreement using the check-in discussion.
// Updates the agreement text (charter evolves), clears approvals so the team
// re-approves the new wording, and records the resolution note for the cycle.
export async function POST(req: Request) {
  const { teamId, component, cycleNumber, resolutionNote, memberId } = await req.json()

  const owned = await requireOwnedMember(memberId)
  if (!owned || owned.teamId !== teamId) {
    return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })
  }

  if (!(await isProjectManager(teamId, memberId))) {
    return NextResponse.json({ error: 'Only the project manager can record this resolution' }, { status: 403 })
  }

  const current = await queryOne<{ final_text: string | null }>(
    'SELECT final_text FROM agreements WHERE team_id = $1 AND component = $2',
    [teamId, component]
  )

  const revised = await reviseAgreement(
    component as ChatComponent,
    current?.final_text ?? '',
    resolutionNote ?? '',
  )

  await query(
    `UPDATE agreements SET draft_text = $1, final_text = $1, recorded_by = $2, updated_at = NOW()
     WHERE team_id = $3 AND component = $4`,
    [revised, memberId, teamId, component]
  )

  await logClauseAuthored(teamId, component, memberId, 'revised', cycleNumber)

  // Updated wording invalidates prior approvals — re-collect them.
  await clearAgreementApprovals(teamId, component)

  // Record the discussion note for this cycle (surfaced in the charter view).
  await query(
    `INSERT INTO resolutions (team_id, component, cycle_number, resolution_note, resolved_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (team_id, component, cycle_number) DO UPDATE
       SET resolution_note = $4, resolved_by = $5, resolved_at = NOW()`,
    [teamId, component, cycleNumber, resolutionNote ?? null, memberId]
  )

  return NextResponse.json({ revised })
}
