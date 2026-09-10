import { query, type TransactionQuery } from './db'

export type PlantState = 'thriving' | 'doing_okay' | 'wilting' | 'dead'
export type PlantHealthSource = 'deadline_missed' | 'task_recovered' | 'checkin'

// Index = level. New teams with no ledger rows yet default to level 3 (thriving).
const LEVEL_STATES: PlantState[] = ['dead', 'wilting', 'doing_okay', 'thriving']
export const DEFAULT_LEVEL = 3

// Advisory-lock classid for plant-health ledger writes. Paired with
// pg_advisory_xact_lock's 2-arg form so this never collides with unrelated
// single-arg advisory locks elsewhere (e.g. task_deadline_events' per-task
// lock), or with other classed locks (e.g. api/teams/route.ts's
// TEAM_VOTE_LOCK_CLASS, 2).
const LEDGER_LOCK_CLASS = 1

export function levelToState(level: number): PlantState {
  return LEVEL_STATES[level]
}

type QueryFn = <T = unknown>(text: string, params?: unknown[]) => Promise<T[]>

export async function getCurrentPlantLevel(db: QueryFn, teamId: string): Promise<number> {
  const rows = await db<{ level: number }>(
    'SELECT level FROM plant_health_events WHERE team_id = $1 ORDER BY occurred_at DESC, id DESC LIMIT 1',
    [teamId]
  )
  return rows[0]?.level ?? DEFAULT_LEVEL
}

export interface ApplyPlantHealthDeltaParams {
  teamId: string
  delta: number
  source: PlantHealthSource
  cycleNumber?: number | null
  detail?: Record<string, unknown>
}

// Callers run this inside their own single-fire guard (an already-inserted
// row, a FOR UPDATE check, etc.) for *their own* event, but the read-then-insert
// of the team's shared level still needs to be serialized against every other
// source that can write this team's ledger concurrently (a deadline miss on
// one task racing a check-in resolution, say) — so this takes a per-team
// transaction-scoped advisory lock itself rather than trusting callers' more
// narrowly-scoped locks (per-task, per-submission) to cover it.
export async function applyPlantHealthDelta(
  tx: TransactionQuery,
  params: ApplyPlantHealthDeltaParams
): Promise<{ level: number; state: PlantState }> {
  await tx.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [LEDGER_LOCK_CLASS, params.teamId])

  const current = await getCurrentPlantLevel(tx.query, params.teamId)
  const level = Math.min(3, Math.max(0, current + params.delta))
  // Store what actually happened to the level, not the raw requested delta —
  // once the level is pinned at the 0/3 floor or ceiling, a further push in
  // the same direction is a no-op and must be recorded as such. Otherwise
  // later code that sums deltas (e.g. counting a task's outstanding deadline
  // misses to recover) overcounts and inflates the level past what it ever
  // actually lost.
  const appliedDelta = level - current

  await tx.query(
    `INSERT INTO plant_health_events (team_id, level, delta, source, cycle_number, detail)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [params.teamId, level, appliedDelta, params.source, params.cycleNumber ?? null, JSON.stringify(params.detail ?? {})]
  )

  return { level, state: levelToState(level) }
}

export async function getCurrentPlantState(teamId: string): Promise<PlantState> {
  const level = await getCurrentPlantLevel(query, teamId)
  return levelToState(level)
}
