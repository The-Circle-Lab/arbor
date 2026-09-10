// Shared "is this cycle fully submitted, and if so what's its computed plant
// state" logic for src/app/api/plant/[code]/[cycle]/route.ts and
// src/app/api/instructor/teams/[teamId]/tension/[cycle]/route.ts — keeps the
// submission-completeness rule and the check-in fetch in one place so the
// two routes can't silently drift apart on what counts as "ready".
import { query } from './db'
import { computePlantState, CheckinRow, PlantResult } from './plant-logic'
import { CHAT_COMPONENTS } from './chat-components'

export interface ReadinessCheckinRow extends CheckinRow {
  member_id: string
  display_name: string
}

export type PlantReadiness =
  | { ready: false }
  | { ready: true; teamSize: number; checkinRows: ReadinessCheckinRow[]; plantResult: PlantResult }

export async function getPlantReadiness(teamId: string, cycleNum: number): Promise<PlantReadiness> {
  const [{ team_size }] = await query<{ team_size: number }>(
    'SELECT COUNT(*)::int AS team_size FROM members WHERE team_id = $1',
    [teamId]
  )

  const submittedRows = await query<{ member_id: string; count: number }>(
    `SELECT ci.member_id, COUNT(DISTINCT ci.component)::int AS count
     FROM checkins ci
     JOIN members m ON m.id = ci.member_id
     WHERE m.team_id = $1 AND ci.cycle_number = $2
     GROUP BY ci.member_id`,
    [teamId, cycleNum]
  )
  const allSubmitted = submittedRows.filter(r => r.count >= CHAT_COMPONENTS.length).length >= team_size
  if (!allSubmitted) return { ready: false }

  const checkinRows = await query<ReadinessCheckinRow>(
    `SELECT ci.member_id, u.display_name, ci.component, ci.response_data
     FROM checkins ci
     JOIN members m ON m.id = ci.member_id
     JOIN users u ON u.id = m.user_id
     WHERE m.team_id = $1 AND ci.cycle_number = $2`,
    [teamId, cycleNum]
  )

  const plantResult = computePlantState(checkinRows, team_size)

  return { ready: true, teamSize: team_size, checkinRows, plantResult }
}
