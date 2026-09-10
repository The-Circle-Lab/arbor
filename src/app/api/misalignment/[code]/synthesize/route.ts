import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { isChatComponent } from '@/lib/chat-components'
import { requireOwnedMember, isProjectManager } from '@/lib/auth/team-access'
import { createSynthesisDraft, getMisalignmentState, isMisalignmentCycleNumber, MisalignmentConflictError } from '@/lib/misalignment'

// POST body { memberId, component, cycleNumber? } — PM-only, requires
// everyone to have acted and no existing resolution row yet.
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const body = await req.json()
  const { memberId, component } = body
  const cycleNumber = isMisalignmentCycleNumber(body.cycleNumber) ? body.cycleNumber : 0

  if (!component || !isChatComponent(component)) {
    return NextResponse.json({ error: 'Invalid component' }, { status: 400 })
  }

  const owned = await requireOwnedMember(memberId)
  if (!owned) return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })

  const team = await queryOne<{ id: string }>('SELECT id FROM teams WHERE join_code = $1', [code.toUpperCase()])
  if (!team || owned.teamId !== team.id) {
    return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })
  }

  if (!(await isProjectManager(team.id, memberId))) {
    return NextResponse.json({ error: 'Only the project manager can generate the synthesis draft' }, { status: 403 })
  }

  const state = await getMisalignmentState(team.id, component, cycleNumber, memberId)
  if (state.actedCount < state.teamSize) {
    return NextResponse.json({ error: 'Not everyone has submitted or skipped yet' }, { status: 409 })
  }

  try {
    await createSynthesisDraft(team.id, component, cycleNumber, memberId)
  } catch (e) {
    if (e instanceof MisalignmentConflictError) {
      return NextResponse.json({ error: e.message }, { status: 409 })
    }
    throw e
  }

  const updated = await getMisalignmentState(team.id, component, cycleNumber, memberId)
  return NextResponse.json(updated)
}
