import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { isChatComponent } from '@/lib/chat-components'
import { requireTeamMember, requireOwnedMember } from '@/lib/auth/team-access'
import { getMisalignmentState, recordMisalignmentAction, isMisalignmentCycleNumber, MisalignmentInvalidActionError } from '@/lib/misalignment'

// GET ?component=<ChatComponent>&cycle=0|1|2 (default cycle=0)
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const membership = await requireTeamMember(code)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const component = searchParams.get('component')
  if (!component || !isChatComponent(component)) {
    return NextResponse.json({ error: 'Invalid component' }, { status: 400 })
  }

  const cycleParam = searchParams.get('cycle')
  const cycleNumber = cycleParam === null ? 0 : Number(cycleParam)
  if (!isMisalignmentCycleNumber(cycleNumber)) {
    return NextResponse.json({ error: 'Invalid cycle' }, { status: 400 })
  }

  const state = await getMisalignmentState(membership.teamId, component, cycleNumber, membership.memberId)
  return NextResponse.json(state)
}

// POST body { memberId, component, cycleNumber?, action: 'submit', content } |
//           { memberId, component, cycleNumber?, action: 'skip' }
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const body = await req.json()
  const { memberId, component, action, content } = body
  const cycleNumber = isMisalignmentCycleNumber(body.cycleNumber) ? body.cycleNumber : 0

  if (!component || !isChatComponent(component)) {
    return NextResponse.json({ error: 'Invalid component' }, { status: 400 })
  }
  if (action !== 'submit' && action !== 'skip') {
    return NextResponse.json({ error: 'action must be "submit" or "skip"' }, { status: 400 })
  }

  const owned = await requireOwnedMember(memberId)
  if (!owned) return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })

  const team = await queryOne<{ id: string; engagement_level: string }>(
    'SELECT id, engagement_level FROM teams WHERE join_code = $1',
    [code.toUpperCase()]
  )
  if (!team || owned.teamId !== team.id) {
    return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })
  }

  // Defense in depth — this flow only exists for HIGH-engagement teams; the
  // frontend never mounts MisalignmentFlow for any other level.
  if (team.engagement_level !== 'high') {
    return NextResponse.json({ error: 'Not available for this team' }, { status: 403 })
  }

  const flaggedRow = cycleNumber === 0
    ? await queryOne<{ flagged_components: string[] }>('SELECT flagged_components FROM reveal_ai WHERE team_id = $1', [team.id])
    : await queryOne<{ flagged_components: string[] }>('SELECT flagged_components FROM plant_states WHERE team_id = $1 AND cycle_number = $2', [team.id, cycleNumber])
  const flagged = flaggedRow?.flagged_components ?? []
  if (!flagged.includes(component)) {
    return NextResponse.json({ error: 'Component is not currently flagged' }, { status: 400 })
  }

  const state = await getMisalignmentState(team.id, component, cycleNumber, memberId)
  if (state.actedCount >= state.teamSize) {
    return NextResponse.json({ error: 'Submissions are locked — everyone has already acted' }, { status: 403 })
  }

  try {
    await recordMisalignmentAction(team.id, component, cycleNumber, memberId, action, content)
  } catch (e) {
    if (e instanceof MisalignmentInvalidActionError) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    throw e
  }

  return NextResponse.json({ ok: true })
}
