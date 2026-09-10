import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { requireOwnedMember } from '@/lib/auth/team-access'
import { recordAgreementApproval, withdrawAgreementApproval } from '@/lib/agreement-approvals'
import { resolveDiscussionTimersIfDone } from '@/lib/discussion-timer'
import { wasComponentFlagged, logComponentResolved } from '@/lib/component-flow-events'
import { isMisalignmentCycleNumber } from '@/lib/misalignment'

export async function POST(req: Request) {
  const { teamId, component, memberId, cycleNumber } = await req.json()

  const owned = await requireOwnedMember(memberId)
  if (!owned || owned.teamId !== teamId) {
    return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })
  }

  const agreement = await queryOne<{ id: string; recorded_by: string | null }>(
    'SELECT id, recorded_by FROM agreements WHERE team_id = $1 AND component = $2 AND final_text IS NOT NULL',
    [teamId, component]
  )
  if (!agreement) return NextResponse.json({ error: 'No agreement draft to approve' }, { status: 400 })

  const wasNewApproval = await recordAgreementApproval(teamId, component, memberId)
  await resolveDiscussionTimersIfDone(teamId)

  // "Resolved" only for a component that actually went through discussion —
  // a component nobody ever flagged auto-drafts and gets rubber-stamped, and
  // isn't part of what this audit trail is meant to track.
  if (wasNewApproval && (await wasComponentFlagged(teamId, component))) {
    const [{ team_size: teamSize }] = await query<{ team_size: number }>(
      'SELECT COUNT(*)::int AS team_size FROM members WHERE team_id = $1',
      [teamId]
    )
    const [{ count: approvalCount }] = await query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM agreement_approvals WHERE team_id = $1 AND component = $2',
      [teamId, component]
    )
    if (approvalCount >= teamSize) {
      await logComponentResolved(teamId, component, isMisalignmentCycleNumber(cycleNumber) ? cycleNumber : 0, {
        recordedBy: agreement.recorded_by,
      })
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const { teamId, component, memberId } = await req.json()

  const owned = await requireOwnedMember(memberId)
  if (!owned || owned.teamId !== teamId) {
    return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })
  }

  await withdrawAgreementApproval(teamId, component, memberId)

  return NextResponse.json({ ok: true })
}
