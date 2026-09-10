import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { getPlantReadiness } from '@/lib/plant-readiness'
import { ChatComponent } from '@/lib/chat-components'
import { requireInstructorTeam } from '@/lib/auth/instructor'
import { isValidCycle } from '@/lib/cycle'

// Team-scoped, no join-code membership check — instructor auth already
// scopes access, same readiness/compute rule as
// src/app/api/plant/[code]/[cycle]/route.ts (shared via getPlantReadiness)
// but recomputed on demand rather than persisted, since nothing today
// persists componentScores.
export async function GET(_req: Request, { params }: { params: Promise<{ teamId: string; cycle: string }> }) {
  try {
    const { teamId, cycle } = await params
    const access = await requireInstructorTeam(teamId)
    if (!access) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    if (!isValidCycle(cycle)) return NextResponse.json({ error: 'Invalid cycle' }, { status: 400 })
    const cycleNum = Number(cycle)

    const readiness = await getPlantReadiness(teamId, cycleNum)
    if (!readiness.ready) return NextResponse.json({ ready: false }, { status: 202 })

    const cached = await queryOne<{ per_component: Record<ChatComponent, string> | null; flagged_components: ChatComponent[] | null }>(
      'SELECT per_component, flagged_components FROM plant_states WHERE team_id = $1 AND cycle_number = $2',
      [teamId, cycleNum]
    )

    return NextResponse.json({
      state: readiness.plantResult.state,
      // Once a plant_states row exists, its flagged_components is the union of
      // this numeric recomputation with the AI-judged flags (see
      // src/app/api/plant/[code]/[cycle]/route.ts) — use that so this matches
      // what the instructor summary was generated from.
      flaggedComponents: cached?.flagged_components ?? readiness.plantResult.flaggedComponents,
      componentScores: readiness.plantResult.componentScores,
      perComponentNotes: cached?.per_component ?? null,
    })
  } catch (e) {
    console.error('GET /api/instructor/teams/[teamId]/tension/[cycle] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
