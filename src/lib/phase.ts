import { query, queryOne } from './db'
import { CHAT_COMPONENTS } from './chat-components'

export interface TeamStatus {
  stage: number
  hasProjectManager: boolean
  teamSize: number
  reflectionsSubmitted: number
  allReflected: boolean
  allAgreed: boolean
  checkin1Submitted: number
  allCheckin1Done: boolean
  checkin2Submitted: number
  allCheckin2Done: boolean
  plant1Resolved: boolean
  plant2Resolved: boolean
  hasFlagsAfterCycle1: boolean
  hasFlagsAfterCycle2: boolean
}

export async function getTeamStatus(teamId: string): Promise<TeamStatus> {
  const [{ team_size }] = await query<{ team_size: number }>(
    'SELECT COUNT(*)::int AS team_size FROM members WHERE team_id = $1',
    [teamId]
  )

  const teamRow = await queryOne<{ project_manager_id: string | null; stage: number }>(
    'SELECT project_manager_id, stage FROM teams WHERE id = $1',
    [teamId]
  )
  const hasProjectManager = !!teamRow?.project_manager_id

  const reflRows = await query<{ count: number }>(
    `SELECT COUNT(DISTINCT member_id)::int AS count
     FROM individual_reflections ir
     JOIN members m ON m.id = ir.member_id
     WHERE m.team_id = $1
     GROUP BY m.team_id
     HAVING COUNT(DISTINCT ir.component) = $2`,
    [teamId, CHAT_COMPONENTS.length]
  ).catch(() => [])

  const reflectionsSubmitted = reflRows[0]?.count ?? 0
  const allReflected = reflectionsSubmitted >= team_size

  // All agreements fully approved by all members
  const agreedRows = await query<{ component: string; approvals: number }>(
    `SELECT a.component, COUNT(aa.member_id)::int AS approvals
     FROM agreements a
     LEFT JOIN agreement_approvals aa ON aa.team_id = a.team_id AND aa.component = a.component
     WHERE a.team_id = $1
     GROUP BY a.component`,
    [teamId]
  )
  const allAgreed =
    agreedRows.length === CHAT_COMPONENTS.length &&
    agreedRows.every(r => r.approvals >= team_size)

  // Per-component approval counts — used to tell when re-flagged components
  // have been re-agreed after a check-in.
  const approvalByComponent = new Map<string, number>()
  for (const r of agreedRows) approvalByComponent.set(r.component, r.approvals)

  // Check-in counts (members who submitted all components for a cycle)
  const checkin1Count = await countCheckinSubmissions(teamId, 1)
  const checkin2Count = await countCheckinSubmissions(teamId, 2)

  const plant1Row = await query<{ flagged_components: string[] }>(
    'SELECT flagged_components FROM plant_states WHERE team_id = $1 AND cycle_number = 1',
    [teamId]
  )
  const plant2Row = await query<{ flagged_components: string[] }>(
    'SELECT flagged_components FROM plant_states WHERE team_id = $1 AND cycle_number = 2',
    [teamId]
  )

  const hasFlagsAfterCycle1 = (plant1Row[0]?.flagged_components ?? []).length > 0
  const hasFlagsAfterCycle2 = (plant2Row[0]?.flagged_components ?? []).length > 0

  // A cycle is resolved when every component it flagged has been re-approved by
  // all members (the plant route clears approvals for flagged components, so a
  // full approval count means the team re-agreed on the updated wording).
  const flagged1 = plant1Row[0]?.flagged_components ?? []
  const plant1Resolved = !hasFlagsAfterCycle1 ||
    flagged1.every(c => (approvalByComponent.get(c) ?? 0) >= team_size)

  const flagged2 = plant2Row[0]?.flagged_components ?? []
  const plant2Resolved = !hasFlagsAfterCycle2 ||
    flagged2.every(c => (approvalByComponent.get(c) ?? 0) >= team_size)

  return {
    stage: teamRow?.stage ?? 0,
    hasProjectManager,
    teamSize: team_size,
    reflectionsSubmitted,
    allReflected,
    allAgreed,
    checkin1Submitted: checkin1Count,
    allCheckin1Done: checkin1Count >= team_size,
    checkin2Submitted: checkin2Count,
    allCheckin2Done: checkin2Count >= team_size,
    plant1Resolved,
    plant2Resolved,
    hasFlagsAfterCycle1,
    hasFlagsAfterCycle2,
  }
}

async function countCheckinSubmissions(teamId: string, cycle: number): Promise<number> {
  const rows = await query<{ count: number }>(
    `SELECT COUNT(DISTINCT ci.member_id)::int AS count
     FROM checkins ci
     JOIN members m ON m.id = ci.member_id
     WHERE m.team_id = $1 AND ci.cycle_number = $2
     AND (
       SELECT COUNT(DISTINCT ci2.component) FROM checkins ci2
       WHERE ci2.member_id = ci.member_id AND ci2.cycle_number = $2
     ) = ${CHAT_COMPONENTS.length}`,
    [teamId, cycle]
  )
  return rows[0]?.count ?? 0
}
