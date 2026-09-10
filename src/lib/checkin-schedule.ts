import { queryOne } from './db'
import type { TeamStatus } from './phase'

export type CheckinAccessMode = 'onboarding' | 'waiting' | 'active' | 'done'

export interface CheckinAccess {
  mode: CheckinAccessMode
  activeCycle: 1 | 2 | null
}

// Check-ins are scheduled, not self-paced: each course gets two fixed
// date/times (set only via direct DB write, never exposed in any UI). A team
// stays dashboard-only ('waiting') until its course's next check-in time
// arrives, at which point it's forced into that check-in flow ('active'),
// and returned to dashboard-only access once resolved.
export async function getCheckinAccess(teamId: string, status: TeamStatus): Promise<CheckinAccess> {
  if (!status.allAgreed) return { mode: 'onboarding', activeCycle: null }

  const cycle1Resolved = status.allCheckin1Done && status.plant1Resolved
  const cycle2Resolved = status.allCheckin2Done && status.plant2Resolved
  if (cycle1Resolved && cycle2Resolved) return { mode: 'done', activeCycle: null }

  const targetCycle: 1 | 2 = cycle1Resolved ? 2 : 1
  const row = await queryOne<{ checkin_1_at: string | null; checkin_2_at: string | null }>(
    `SELECT c.checkin_1_at, c.checkin_2_at FROM teams t
     LEFT JOIN courses c ON c.id = t.course_id WHERE t.id = $1`,
    [teamId]
  )
  const scheduledAt = targetCycle === 1 ? row?.checkin_1_at : row?.checkin_2_at
  if (!scheduledAt || new Date(scheduledAt) > new Date()) return { mode: 'waiting', activeCycle: null }
  return { mode: 'active', activeCycle: targetCycle }
}
