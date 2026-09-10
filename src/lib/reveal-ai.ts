import { query } from './db'
import { RevealAIResult } from './ai'
import { EngagementLevel, computeFacilitationOrder } from './subject-scoring'
import { getTeamMemberVoiceScores } from './db/subject-scoring'
import { logFacilitationInstructionFired } from './component-flow-events'

// Shared by both places that can be first to generate a team's reveal_ai row
// (POST /api/reveal-ai and the fire-and-forget path in
// GET /api/reflections/[code]) so the insert and the facilitation-instruction
// logging that depends on "did this insert actually win the race" live in one
// place instead of two copies that could drift.
export async function persistRevealAiResult(
  teamId: string,
  result: RevealAIResult,
  engagementLevel: EngagementLevel
): Promise<void> {
  const inserted = await query<{ team_id: string }>(
    `INSERT INTO reveal_ai (team_id, per_component, flagged_components, split_reasons)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (team_id) DO NOTHING
     RETURNING team_id`,
    [teamId, JSON.stringify(result.perComponent), result.flaggedComponents, JSON.stringify(result.splitReasons)]
  )
  // Lost the race to a concurrent caller — that caller's own insert already
  // logged the facilitation instructions, so skip logging here too.
  if (inserted.length === 0) return

  if (engagementLevel === 'medium' && result.flaggedComponents.length > 0) {
    const facilitationOrder = computeFacilitationOrder(await getTeamMemberVoiceScores(teamId)).map(entry => entry.memberId)
    for (const component of result.flaggedComponents) {
      await logFacilitationInstructionFired(teamId, component, 0, {
        hasSplitReason: !!result.splitReasons[component],
        facilitationOrder,
      })
    }
  }
}
