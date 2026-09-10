import { query } from './db'
import { CHAT_COMPONENTS, ChatComponent, COMPONENT_LABELS } from './chat-components'
import { levelToState, type PlantState } from './plant-health'

export interface FinalReportTeam {
  id: string
  name: string
  projectTitle: string | null
  deadline: string | null
  plantType: string | null
  grade: string | null
}

// A grade typed into the DB as '' or whitespace should behave as "no grade" —
// used by both the summary route (freshness check) and anywhere the grade is
// read for display.
export function normalizeGrade(grade: string | null | undefined): string | null {
  const trimmed = grade?.trim()
  return trimmed ? trimmed : null
}

export interface PlantHealthEntry {
  occurredAt: string
  level: number
  state: PlantState
  delta: number
  source: 'deadline_missed' | 'task_recovered' | 'checkin'
  taskId: string | null
  cycleNumber: number | null
  flaggedComponents: ChatComponent[] | null
  perComponent: Record<ChatComponent, string> | null
}

export interface AgreementEntry {
  component: ChatComponent
  finalText: string | null
}

export interface DecisionTimelineEntry {
  type: 'agreement_reached' | 'tension_resolved'
  at: string
  component?: ChatComponent
  label: string
  detail: string
}

export interface FinalReportContext {
  team: FinalReportTeam
  agreements: AgreementEntry[]
  plantHealthHistory: PlantHealthEntry[]
  resolutions: { component: ChatComponent; cycleNumber: number; resolutionNote: string | null; resolvedAt: string }[]
}

export async function buildFinalReportContext(teamId: string): Promise<FinalReportContext> {
  const teamRow = await query<{ id: string; name: string; project_title: string | null; deadline: string | null; plant_type: string | null; grade: string | null }>(
    'SELECT id, name, project_title, deadline, plant_type, grade FROM teams WHERE id = $1',
    [teamId]
  )
  const team: FinalReportTeam = {
    id: teamRow[0].id,
    name: teamRow[0].name,
    projectTitle: teamRow[0].project_title,
    deadline: teamRow[0].deadline,
    plantType: teamRow[0].plant_type,
    grade: teamRow[0].grade,
  }

  const agreementRows = await query<{ component: ChatComponent; final_text: string | null }>(
    'SELECT component, final_text FROM agreements WHERE team_id = $1',
    [teamId]
  )
  const agreementByComponent = new Map(agreementRows.map(a => [a.component, a.final_text]))
  const agreements: AgreementEntry[] = CHAT_COMPONENTS.map(c => ({ component: c, finalText: agreementByComponent.get(c) ?? null }))

  // The `tasks` table is gone (tasks feature removed) — plant_health_events
  // rows sourced from the old task workflow (deadline_missed/task_recovered)
  // are preserved and still read here, just without a joined task title.
  const plantEventRows = await query<{
    occurred_at: string
    level: number
    delta: number
    source: 'deadline_missed' | 'task_recovered' | 'checkin'
    task_id: string | null
    cycle_number: number | null
    detail: { flaggedComponents?: ChatComponent[] }
    per_component: Record<ChatComponent, string> | null
  }>(
    `SELECT phe.occurred_at, phe.level, phe.delta, phe.source, phe.task_id, phe.cycle_number, phe.detail,
            ps.per_component
     FROM plant_health_events phe
     LEFT JOIN plant_states ps ON ps.team_id = phe.team_id AND ps.cycle_number = phe.cycle_number AND phe.source = 'checkin'
     WHERE phe.team_id = $1
     ORDER BY phe.occurred_at`,
    [teamId]
  )
  const plantHealthHistory: PlantHealthEntry[] = plantEventRows.map(r => ({
    occurredAt: r.occurred_at,
    level: r.level,
    state: levelToState(r.level),
    delta: r.delta,
    source: r.source,
    taskId: r.task_id,
    cycleNumber: r.cycle_number,
    flaggedComponents: r.detail?.flaggedComponents ?? null,
    perComponent: r.per_component,
  }))

  const resolutionRows = await query<{ component: ChatComponent; cycle_number: number; resolution_note: string | null; resolved_at: string }>(
    'SELECT component, cycle_number, resolution_note, resolved_at FROM resolutions WHERE team_id = $1 ORDER BY resolved_at',
    [teamId]
  )
  const resolutions = resolutionRows.map(r => ({ component: r.component, cycleNumber: r.cycle_number, resolutionNote: r.resolution_note, resolvedAt: r.resolved_at }))

  return { team, agreements, plantHealthHistory, resolutions }
}

export async function buildDecisionTimeline(teamId: string, context: FinalReportContext): Promise<DecisionTimelineEntry[]> {
  const teamSizeRows = await query<{ team_size: number }>('SELECT COUNT(*)::int AS team_size FROM members WHERE team_id = $1', [teamId])
  const teamSize = teamSizeRows[0]?.team_size ?? 0

  const approvalRows = await query<{ component: ChatComponent; approved_at: string; approvals: number }>(
    `SELECT component, MAX(approved_at) AS approved_at, COUNT(*)::int AS approvals
     FROM agreement_approvals WHERE team_id = $1 GROUP BY component`,
    [teamId]
  )

  const entries: DecisionTimelineEntry[] = []

  for (const a of approvalRows) {
    if (a.approvals < teamSize) continue
    const text = context.agreements.find(ag => ag.component === a.component)?.finalText
    entries.push({
      type: 'agreement_reached',
      at: a.approved_at,
      component: a.component,
      label: `Agreed on ${COMPONENT_LABELS[a.component]}`,
      detail: text ?? 'The team reached agreement.',
    })
  }

  for (const r of context.resolutions) {
    if (!r.resolutionNote) continue
    entries.push({
      type: 'tension_resolved',
      at: r.resolvedAt,
      component: r.component,
      label: `Resolved tension on ${COMPONENT_LABELS[r.component]} (check-in ${r.cycleNumber})`,
      detail: r.resolutionNote,
    })
  }

  return entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
}
