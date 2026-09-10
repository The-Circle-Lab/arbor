import { query, queryOne, withTransaction } from './db'
import { getTeamStatus } from './phase'

// Single owning module for discussion_timers / discussion_timer_extensions —
// same convention as agreement-approvals.ts.

export type DiscussionStep = 'AGREEING' | 'CHECKIN_AGREE'

const DISCUSSION_STEPS: readonly string[] = ['AGREEING', 'CHECKIN_AGREE']

export function isDiscussionStep(value: unknown): value is DiscussionStep {
  return typeof value === 'string' && DISCUSSION_STEPS.includes(value)
}

export function isValidCycleNumber(value: unknown): value is number | null {
  return value === null || value === 1 || value === 2
}

export interface DiscussionTimerState {
  startedAt: string
  expiresAt: string
  extensionCount: number
}

const EXTENSION_MINUTES = 5

export async function getActiveTimer(
  teamId: string,
  step: DiscussionStep,
  cycleNumber: number | null
): Promise<DiscussionTimerState | null> {
  const row = await queryOne<{ started_at: string; expires_at: string; extension_count: number }>(
    `SELECT dt.started_at, dt.expires_at,
            (SELECT COUNT(*)::int FROM discussion_timer_extensions e WHERE e.timer_id = dt.id) AS extension_count
     FROM discussion_timers dt
     WHERE dt.team_id = $1 AND dt.step = $2 AND dt.cycle_number IS NOT DISTINCT FROM $3 AND dt.resolved_at IS NULL`,
    [teamId, step, cycleNumber]
  )
  if (!row) return null
  return { startedAt: row.started_at, expiresAt: row.expires_at, extensionCount: row.extension_count }
}

// Insert-or-get, atomically: ON CONFLICT targets the partial unique index on
// (team_id, step, cycle_number) WHERE resolved_at IS NULL. DO UPDATE (rather
// than DO NOTHING) with a no-op self-assignment makes RETURNING fire on the
// conflict path too, so this is one round trip that always yields a row —
// no gap where a concurrent resolve could race a separate follow-up SELECT.
export async function startTimer(
  teamId: string,
  step: DiscussionStep,
  cycleNumber: number | null
): Promise<DiscussionTimerState> {
  const row = await queryOne<{ id: string; started_at: string; expires_at: string }>(
    `INSERT INTO discussion_timers (team_id, step, cycle_number, started_at, expires_at)
     VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '15 minutes')
     ON CONFLICT (team_id, step, cycle_number) WHERE resolved_at IS NULL
     DO UPDATE SET started_at = discussion_timers.started_at
     RETURNING id, started_at, expires_at`,
    [teamId, step, cycleNumber]
  )
  if (!row) throw new Error('startTimer: insert-or-update did not return a row')

  const ext = await queryOne<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM discussion_timer_extensions WHERE timer_id = $1',
    [row.id]
  )
  return { startedAt: row.started_at, expiresAt: row.expires_at, extensionCount: ext?.count ?? 0 }
}

// Only succeeds once the timer has actually expired — rejects (returns
// null) a stray double-click that would otherwise extend a timer that
// still has time left. The expires_at bump and its audit-trail row are
// committed together, so a failure between the two can never leave a
// timer extended with no matching extension record.
export async function extendTimer(
  teamId: string,
  step: DiscussionStep,
  cycleNumber: number | null
): Promise<DiscussionTimerState | null> {
  const extended = await withTransaction(async tx => {
    const rows = await tx.query<{ id: string }>(
      `UPDATE discussion_timers SET expires_at = NOW() + make_interval(mins => $4)
       WHERE team_id = $1 AND step = $2 AND cycle_number IS NOT DISTINCT FROM $3
         AND resolved_at IS NULL AND expires_at <= NOW()
       RETURNING id`,
      [teamId, step, cycleNumber, EXTENSION_MINUTES]
    )
    const updated = rows[0] ?? null
    if (!updated) return false

    await tx.query(
      'INSERT INTO discussion_timer_extensions (timer_id, minutes_added) VALUES ($1, $2)',
      [updated.id, EXTENSION_MINUTES]
    )
    return true
  })
  if (!extended) return null

  return getActiveTimer(teamId, step, cycleNumber)
}

// Whether (step, cycleNumber) is the discussion the team is actually in
// right now, independent of who's asking. Project-manager gating
// (isProjectManager, in team-access.ts) controls *who* can start a timer;
// this controls *when* — without it, a stale page could start a timer for
// a step the team hasn't reached yet.
export async function isCurrentDiscussionStep(
  teamId: string,
  step: DiscussionStep,
  cycleNumber: number | null
): Promise<boolean> {
  const status = await getTeamStatus(teamId)
  if (step === 'AGREEING') return cycleNumber === null && !status.allAgreed
  if (cycleNumber === 1) return status.hasFlagsAfterCycle1 && !status.plant1Resolved
  if (cycleNumber === 2) return status.hasFlagsAfterCycle2 && !status.plant2Resolved
  return false
}

// Called after recording an agreement approval. Reuses getTeamStatus's
// existing allAgreed / plantNResolved conditions (the same ones that
// advance phase) rather than re-deriving them, and resolves whichever
// timer scope just became satisfied.
export async function resolveDiscussionTimersIfDone(teamId: string): Promise<void> {
  const status = await getTeamStatus(teamId)
  if (status.allAgreed) await resolveTimer(teamId, 'AGREEING', null)
  if (status.hasFlagsAfterCycle1 && status.plant1Resolved) await resolveTimer(teamId, 'CHECKIN_AGREE', 1)
  if (status.hasFlagsAfterCycle2 && status.plant2Resolved) await resolveTimer(teamId, 'CHECKIN_AGREE', 2)
}

async function resolveTimer(teamId: string, step: DiscussionStep, cycleNumber: number | null): Promise<void> {
  await query(
    `UPDATE discussion_timers SET resolved_at = NOW()
     WHERE team_id = $1 AND step = $2 AND cycle_number IS NOT DISTINCT FROM $3 AND resolved_at IS NULL`,
    [teamId, step, cycleNumber]
  )
}
