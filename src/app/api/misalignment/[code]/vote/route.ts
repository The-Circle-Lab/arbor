import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { isChatComponent } from '@/lib/chat-components'
import { requireOwnedMember } from '@/lib/auth/team-access'
import {
  castMisalignmentVote,
  getMisalignmentState,
  isMisalignmentCycleNumber,
  MisalignmentSkippedError,
  MisalignmentNotFoundError,
  MisalignmentInvalidActionError,
} from '@/lib/misalignment'

// POST body { memberId, component, cycleNumber?, vote: 'approve' | 'reject' }
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const body = await req.json()
  const { memberId, component, vote } = body
  const cycleNumber = isMisalignmentCycleNumber(body.cycleNumber) ? body.cycleNumber : 0

  if (!component || !isChatComponent(component)) {
    return NextResponse.json({ error: 'Invalid component' }, { status: 400 })
  }
  if (vote !== 'approve' && vote !== 'reject') {
    return NextResponse.json({ error: 'vote must be "approve" or "reject"' }, { status: 400 })
  }

  const owned = await requireOwnedMember(memberId)
  if (!owned) return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })

  const team = await queryOne<{ id: string }>('SELECT id FROM teams WHERE join_code = $1', [code.toUpperCase()])
  if (!team || owned.teamId !== team.id) {
    return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })
  }

  try {
    await castMisalignmentVote(team.id, component, cycleNumber, memberId, vote)
  } catch (e) {
    if (e instanceof MisalignmentSkippedError) {
      return NextResponse.json({ error: e.message }, { status: 403 })
    }
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
