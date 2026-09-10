export const maxDuration = 60

import { NextResponse } from 'next/server'
import { query, queryOne, withTransaction } from '@/lib/db'
import { flagCountToLevelDrop } from '@/lib/plant-logic'
import { getPlantReadiness } from '@/lib/plant-readiness'
import { generateCheckinComparison, CheckinSummary } from '@/lib/ai'
import { ChatComponent, isChatComponent } from '@/lib/chat-components'
import { requireTeamMember } from '@/lib/auth/team-access'
import { clearAgreementApprovals } from '@/lib/agreement-approvals'
import { applyPlantHealthDelta, getCurrentPlantLevel, levelToState } from '@/lib/plant-health'
import { isValidCycle } from '@/lib/cycle'
import { computeFacilitationOrder } from '@/lib/subject-scoring'
import { getTeamMemberVoiceScores } from '@/lib/db/subject-scoring'
import { logFacilitationInstructionFired } from '@/lib/component-flow-events'

export async function GET(_req: Request, { params }: { params: Promise<{ code: string; cycle: string }> }) {
  try {
    const { code, cycle } = await params

    const membership = await requireTeamMember(code)
    if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const teamId = membership.teamId

    if (!isValidCycle(cycle)) return NextResponse.json({ error: 'Invalid cycle' }, { status: 400 })
    const cycleNum = Number(cycle)

    // Return cached
    const cached = await queryOne<{
      computed_state: string
      flagged_components: string[]
      ai_nudge_text: string | string[]
      per_component: Record<string, string>
      split_reasons: Record<string, string> | null
    }>(
      'SELECT computed_state, flagged_components, ai_nudge_text, per_component, split_reasons FROM plant_states WHERE team_id = $1 AND cycle_number = $2',
      [teamId, cycleNum]
    )
    if (cached) return NextResponse.json(cached)

    const readiness = await getPlantReadiness(teamId, cycleNum)
    if (!readiness.ready) return NextResponse.json({ ready: false }, { status: 202 })
    const { checkinRows, plantResult } = readiness

    // Fetch agreements for nudge context
    const agreementRows = await query<{ component: string; final_text: string }>(
      'SELECT component, final_text FROM agreements WHERE team_id = $1 AND final_text IS NOT NULL',
      [teamId]
    )
    const agreements: Partial<Record<ChatComponent, string>> = {}
    for (const r of agreementRows) {
      if (isChatComponent(r.component)) agreements[r.component] = r.final_text
    }

    // Build per-member summary for AI
    const memberMap = new Map<string, CheckinSummary>()
    for (const row of checkinRows) {
      let entry = memberMap.get(row.member_id)
      if (!entry) {
        entry = { displayName: row.display_name, checkins: {} }
        memberMap.set(row.member_id, entry)
      }
      const data = row.response_data
      entry.checkins[row.component] = {
        rating: data.rating,
        notes: data.ratings,
      }
    }

    const comparison = await generateCheckinComparison(
      Array.from(memberMap.values()),
      agreements,
      cycleNum
    )

    // Merge AI flags with computed flags
    const allFlagged = Array.from(new Set([
      ...plantResult.flaggedComponents,
      ...comparison.flaggedComponents,
    ]))

    let finalState = plantResult.state
    let wasInserted = false
    await withTransaction(async tx => {
      const inserted = await tx.query<{ team_id: string }>(
        `INSERT INTO plant_states (team_id, cycle_number, computed_state, flagged_components, ai_nudge_text, per_component, split_reasons)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (team_id, cycle_number) DO NOTHING
         RETURNING team_id`,
        [teamId, cycleNum, plantResult.state, allFlagged, null, JSON.stringify(comparison.perComponent), JSON.stringify(comparison.splitReasons)]
      )
      if (inserted.length === 0) return
      wasInserted = true

      const drop = flagCountToLevelDrop(allFlagged.length)
      if (drop > 0) {
        const result = await applyPlantHealthDelta(tx, {
          teamId,
          delta: -drop,
          source: 'checkin',
          cycleNumber: cycleNum,
          detail: { flaggedComponents: allFlagged },
        })
        finalState = result.state
      } else {
        const level = await getCurrentPlantLevel(tx.query, teamId)
        finalState = levelToState(level)
      }
      await tx.query(
        'UPDATE plant_states SET computed_state = $1 WHERE team_id = $2 AND cycle_number = $3',
        [finalState, teamId, cycleNum]
      )
    })

    // Flagged components are unsettled again — clear their approvals so the team
    // must re-agree on the updated wording before the cycle counts as resolved.
    await clearAgreementApprovals(teamId, allFlagged)

    if (wasInserted && allFlagged.length > 0) {
      const team = await queryOne<{ engagement_level: string }>('SELECT engagement_level FROM teams WHERE id = $1', [teamId])
      if (team?.engagement_level === 'medium') {
        const facilitationOrder = computeFacilitationOrder(await getTeamMemberVoiceScores(teamId)).map(entry => entry.memberId)
        for (const component of allFlagged) {
          await logFacilitationInstructionFired(teamId, component, cycleNum, {
            hasSplitReason: !!comparison.splitReasons[component],
            facilitationOrder,
          })
        }
      }
    }

    return NextResponse.json({
      computed_state: finalState,
      flagged_components: allFlagged,
      per_component: comparison.perComponent,
      split_reasons: comparison.splitReasons,
    })
  } catch (e) {
    console.error('GET /api/plant/[code]/[cycle] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
