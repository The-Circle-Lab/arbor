export const maxDuration = 60

import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { requireInstructorTeam } from '@/lib/auth/instructor'
import { generateInstructorCheckinSummary } from '@/lib/ai'
import { ChatComponent } from '@/lib/chat-components'
import { isValidCycle } from '@/lib/cycle'

interface SummaryRow {
  team_id: string
  cycle_number: number
  summary: string
  watch_points: string[]
  generated_at: string
}

async function fetchCachedSummary(teamId: string, cycleNum: number): Promise<SummaryRow | null> {
  return queryOne<SummaryRow>(
    'SELECT team_id, cycle_number, summary, watch_points, generated_at FROM instructor_summaries WHERE team_id = $1 AND cycle_number = $2',
    [teamId, cycleNum]
  )
}

export async function GET(_req: Request, { params }: { params: Promise<{ teamId: string; cycle: string }> }) {
  try {
    const { teamId, cycle } = await params
    const access = await requireInstructorTeam(teamId)
    if (!access) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    if (!isValidCycle(cycle)) return NextResponse.json({ error: 'Invalid cycle' }, { status: 400 })

    const cached = await fetchCachedSummary(teamId, Number(cycle))
    return NextResponse.json({ cached })
  } catch (e) {
    console.error('GET /api/instructor/teams/[teamId]/summary/[cycle] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(_req: Request, { params }: { params: Promise<{ teamId: string; cycle: string }> }) {
  try {
    const { teamId, cycle } = await params
    const access = await requireInstructorTeam(teamId)
    if (!access) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    if (!isValidCycle(cycle)) return NextResponse.json({ error: 'Invalid cycle' }, { status: 400 })
    const cycleNum = Number(cycle)

    const plantState = await queryOne<{ flagged_components: ChatComponent[]; per_component: Record<ChatComponent, string> | null }>(
      'SELECT flagged_components, per_component FROM plant_states WHERE team_id = $1 AND cycle_number = $2',
      [teamId, cycleNum]
    )
    if (!plantState) return NextResponse.json({ ready: false }, { status: 202 })

    const existing = await fetchCachedSummary(teamId, cycleNum)
    if (existing) return NextResponse.json(existing)

    // per_component is always populated alongside flagged_components/computed_state
    // whenever a plant_states row exists (see src/app/api/plant/[code]/[cycle]/route.ts) —
    // this guard only covers a row inserted some other way than that flow.
    if (!plantState.per_component) {
      return NextResponse.json({ error: 'This cycle has no per-component analysis yet.' }, { status: 500 })
    }

    const team = await queryOne<{ project_title: string | null }>('SELECT project_title FROM teams WHERE id = $1', [teamId])

    const result = await generateInstructorCheckinSummary(
      { projectTitle: team?.project_title ?? null },
      cycleNum,
      plantState.flagged_components,
      plantState.per_component,
    )

    const inserted = await queryOne<SummaryRow>(
      `INSERT INTO instructor_summaries (team_id, cycle_number, summary, watch_points)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (team_id, cycle_number) DO NOTHING
       RETURNING team_id, cycle_number, summary, watch_points, generated_at`,
      [teamId, cycleNum, result.summary, JSON.stringify(result.watchPoints)]
    )

    return NextResponse.json(inserted ?? (await fetchCachedSummary(teamId, cycleNum)))
  } catch (e) {
    console.error('POST /api/instructor/teams/[teamId]/summary/[cycle] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
