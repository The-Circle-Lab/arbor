import { query, queryOne } from './db'
import { ChatComponent } from './chat-components'
import { EngagementLevel } from './subject-scoring'

// Single owning module for component_flow_events — the append-only audit
// trail of the reveal/agree/check-in flow (engagement scoring, facilitation
// gating, the HIGH-engagement submission/resolution steps, and who
// authored/resolved each component's clause). Every write goes through one
// of the typed helpers below instead of hand-writing the insert, same
// "single owning module" convention as agreement-approvals.ts.

export type ComponentFlowEventSource =
  | 'engagement_level_computed'
  | 'facilitation_instruction_fired'
  | 'submission_step_summary'
  | 'resolution_rejected'
  | 'regeneration_cap_hit'
  | 'member_skipped'
  | 'component_resolved'
  | 'clause_authored'

interface LogParams {
  teamId: string
  component?: ChatComponent | null
  cycleNumber?: number | null
  memberId?: string | null
  source: ComponentFlowEventSource
  detail?: Record<string, unknown>
}

async function logComponentFlowEvent(params: LogParams): Promise<void> {
  await query(
    `INSERT INTO component_flow_events (team_id, component, cycle_number, member_id, source, detail)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      params.teamId,
      params.component ?? null,
      params.cycleNumber ?? null,
      params.memberId ?? null,
      params.source,
      JSON.stringify(params.detail ?? {}),
    ]
  )
}

// Team-level fact, not component/cycle-scoped — logged every time
// refreshTeamEngagementLevel recomputes it (see src/lib/db/subject-scoring.ts).
export function logEngagementLevelComputed(
  teamId: string,
  level: EngagementLevel,
  inputs: { positionSpread: number | null; voiceDenominator: number; voiceBelowV4: number }
): Promise<void> {
  return logComponentFlowEvent({
    teamId,
    source: 'engagement_level_computed',
    detail: { level, ...inputs },
  })
}

// Fires exactly when a MEDIUM team's flagged component gets the "state your
// own position first, in this order" gate — i.e. wherever the reveal/check-in
// UI would render the facilitation-order instruction. `facilitationOrder` is
// the actual order shown (caller computes it via computeFacilitationOrder —
// kept out of this module to avoid a circular import with
// lib/db/subject-scoring.ts, which this module's engagement-level logging is
// itself called from).
export function logFacilitationInstructionFired(
  teamId: string,
  component: ChatComponent,
  cycleNumber: number,
  info: { hasSplitReason: boolean; facilitationOrder: string[] }
): Promise<void> {
  return logComponentFlowEvent({
    teamId,
    component,
    cycleNumber,
    source: 'facilitation_instruction_fired',
    detail: info,
  })
}

// HIGH-engagement only — logged once, exactly when the last member's
// submit/skip fills the roster (callers already gate further POSTs once
// actedCount >= teamSize, so this can only fire once per component/cycle).
export function logSubmissionStepSummary(
  teamId: string,
  component: ChatComponent,
  cycleNumber: number,
  counts: { submittedCount: number; skippedCount: number; teamSize: number }
): Promise<void> {
  return logComponentFlowEvent({
    teamId,
    component,
    cycleNumber,
    source: 'submission_step_summary',
    detail: counts,
  })
}

export function logResolutionRejected(
  teamId: string,
  component: ChatComponent,
  cycleNumber: number,
  memberId: string,
  info: { rejectCount: number; round: number }
): Promise<void> {
  return logComponentFlowEvent({
    teamId,
    component,
    cycleNumber,
    memberId,
    source: 'resolution_rejected',
    detail: info,
  })
}

// Logged once, the moment a second rejection forces manual mode (the
// 3-attempt regeneration cap being hit).
export function logRegenerationCapHit(
  teamId: string,
  component: ChatComponent,
  cycleNumber: number,
  info: { rejectCount: number }
): Promise<void> {
  return logComponentFlowEvent({
    teamId,
    component,
    cycleNumber,
    source: 'regeneration_cap_hit',
    detail: info,
  })
}

// `gate` names the checkpoint the skip happened at (today, the only skip
// gate anywhere in the app is the HIGH-engagement misalignment submission
// step) and `teamStage` is the team's overall 0-9 progress (teams.stage) at
// the moment of the skip, for "how far along was the team when this
// happened" context.
export function logMemberSkipped(
  teamId: string,
  component: ChatComponent,
  cycleNumber: number,
  memberId: string,
  info: { gate: string; teamStage: number }
): Promise<void> {
  return logComponentFlowEvent({
    teamId,
    component,
    cycleNumber,
    memberId,
    source: 'member_skipped',
    detail: info,
  })
}

export function logComponentResolved(
  teamId: string,
  component: ChatComponent,
  cycleNumber: number | null,
  info: { recordedBy: string | null }
): Promise<void> {
  return logComponentFlowEvent({
    teamId,
    component,
    cycleNumber,
    source: 'component_resolved',
    detail: info,
  })
}

export type ClauseAuthorAction = 'drafted' | 'edited' | 'revised' | 'synthesized' | 'manual' | 'finalized'

export function logClauseAuthored(
  teamId: string,
  component: ChatComponent,
  memberId: string,
  action: ClauseAuthorAction,
  cycleNumber?: number | null
): Promise<void> {
  return logComponentFlowEvent({
    teamId,
    component,
    cycleNumber: cycleNumber ?? null,
    memberId,
    source: 'clause_authored',
    detail: { action },
  })
}

// Gates clause-authorship/resolution logging to components that were
// actually flagged at some point — the initial reveal pass or either
// check-in re-flag — so routine, never-discussed components (auto-drafted,
// never contested) don't pollute the audit trail alongside the ones this is
// actually meant to track.
export async function wasComponentFlagged(teamId: string, component: ChatComponent): Promise<boolean> {
  const revealRow = await queryOne<{ flagged_components: string[] }>(
    'SELECT flagged_components FROM reveal_ai WHERE team_id = $1',
    [teamId]
  )
  if (revealRow?.flagged_components.includes(component)) return true

  const plantRows = await query<{ flagged_components: string[] }>(
    'SELECT flagged_components FROM plant_states WHERE team_id = $1',
    [teamId]
  )
  return plantRows.some(row => row.flagged_components.includes(component))
}
