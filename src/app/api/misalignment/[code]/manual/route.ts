import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { isChatComponent } from '@/lib/chat-components'
import { requireOwnedMember, isProjectManager } from '@/lib/auth/team-access'
import {
  saveManualDraft,
  getMisalignmentState,
  isMisalignmentCycleNumber,
  MisalignmentNotFoundError,
  MisalignmentInvalidActionError,
} from '@/lib/misalignment'

// PATCH body { memberId, component, cycleNumber?, text } — PM-only, requires
// the component to already be in manual mode (two rejections, or an
// all-skipped stage 1). Bumps `round`, reopening approval for everyone.
export async function PATCH(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const body = await req.json()
  const { memberId, component, text } = body
  const cycleNumber = isMisalignmentCycleNumber(body.cycleNumber) ? body.cycleNumber : 0

  if (!component || !isChatComponent(component)) {
    return NextResponse.json({ error: 'Invalid component' }, { status: 400 })
  }
  if (typeof text !== 'string') {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  const owned = await requireOwnedMember(memberId)
  if (!owned) return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })

  const team = await queryOne<{ id: string }>('SELECT id FROM teams WHERE join_code = $1', [code.toUpperCase()])
  if (!team || owned.teamId !== team.id) {
    return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })
  }

  if (!(await isProjectManager(team.id, memberId))) {
    return NextResponse.json({ error: 'Only the project manager can edit the manual draft' }, { status: 403 })
  }

  try {
    await saveManualDraft(team.id, component, cycleNumber, text)
  } catch (e) {
    if (e instanceof MisalignmentNotFoundError) {
      return NextResponse.json({ error: e.message }, { status: 404 })
    }
    if (e instanceof MisalignmentInvalidActionError) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    throw e
  }

  const updated = await getMisalignmentState(team.id, component, cycleNumber, memberId)
  return NextResponse.json(updated)
}
