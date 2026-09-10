import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { generateAgreementDraft, MemberReflection } from '@/lib/ai'
import { ChatComponent } from '@/lib/chat-components'
import { requireOwnedMember, requireTeamMemberByTeamId, isProjectManager } from '@/lib/auth/team-access'
import { clearAgreementApprovals, listAgreementApprovals } from '@/lib/agreement-approvals'
import { wasComponentFlagged, logClauseAuthored } from '@/lib/component-flow-events'

// POST: save resolution note and trigger AI draft generation
export async function POST(req: Request) {
  const { teamId, component, resolutionNote, memberId } = await req.json()

  const owned = await requireOwnedMember(memberId)
  if (!owned || owned.teamId !== teamId) {
    return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })
  }

  // A resolution note is the project manager recording what the team decided
  // for a flagged component — restrict that. The no-note path (auto-drafting
  // an already-aligned, non-flagged component) stays open to whichever
  // member's client happens to poll first; it's not a team decision to record.
  if (resolutionNote && !(await isProjectManager(teamId, memberId))) {
    return NextResponse.json({ error: 'Only the project manager can record the resolution note' }, { status: 403 })
  }

  // Fetch member reflections for AI draft
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
     WHERE m.team_id = $1 AND ir.component = $2
     ORDER BY m.joined_at`,
    [teamId, component]
  )

  const members: MemberReflection[] = []
  const seen = new Set<string>()
  for (const r of reflections) {
    if (!seen.has(r.member_id)) {
      seen.add(r.member_id)
      members.push({ displayName: r.display_name, responses: { [component]: r.response_data } as MemberReflection['responses'] })
    }
  }

  const draftText = await generateAgreementDraft(component as ChatComponent, members, resolutionNote)

  await query(
    `INSERT INTO agreements (team_id, component, resolution_note, draft_text, final_text, recorded_by)
     VALUES ($1, $2, $3, $4, $4, $5)
     ON CONFLICT (team_id, component) DO UPDATE
       SET resolution_note = $3, draft_text = $4, final_text = $4, recorded_by = $5, updated_at = NOW()`,
    [teamId, component, resolutionNote ?? null, draftText, memberId]
  )

  // A resolution note only ever accompanies the flagged-component path (see
  // the isProjectManager check above) — the no-note auto-draft path is for
  // never-discussed components this audit trail isn't meant to track.
  if (resolutionNote) {
    await logClauseAuthored(teamId, component, memberId, 'drafted', 0)
  }

  // Clear existing approvals since draft changed
  await clearAgreementApprovals(teamId, component)

  return NextResponse.json({ draftText })
}

// PATCH: update final text
export async function PATCH(req: Request) {
  const { teamId, component, finalText, memberId } = await req.json()

  const owned = await requireOwnedMember(memberId)
  if (!owned || owned.teamId !== teamId) {
    return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })
  }

  if (!(await isProjectManager(teamId, memberId))) {
    return NextResponse.json({ error: 'Only the project manager can edit the agreement text' }, { status: 403 })
  }

  await query(
    `UPDATE agreements SET final_text = $1, recorded_by = $2, updated_at = NOW()
     WHERE team_id = $3 AND component = $4`,
    [finalText, memberId, teamId, component]
  )

  if (await wasComponentFlagged(teamId, component)) {
    await logClauseAuthored(teamId, component, memberId, 'edited')
  }

  // Clear approvals when text is edited
  await clearAgreementApprovals(teamId, component)

  return NextResponse.json({ ok: true })
}

// GET: fetch all agreements for a team
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const teamId = searchParams.get('teamId')
  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

  const membership = await requireTeamMemberByTeamId(teamId)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const agreements = await query<{
    component: string
    resolution_note: string
    draft_text: string
    final_text: string
    recorded_by: string
  }>(
    'SELECT component, resolution_note, draft_text, final_text, recorded_by FROM agreements WHERE team_id = $1',
    [teamId]
  )

  const approvals = await listAgreementApprovals(teamId)

  return NextResponse.json({ agreements, approvals })
}
