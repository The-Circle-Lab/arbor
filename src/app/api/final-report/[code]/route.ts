export const maxDuration = 60

import { NextResponse } from 'next/server'
import { query, queryOne, tryWithAdvisoryLock } from '@/lib/db'
import { requireTeamMember } from '@/lib/auth/team-access'
import { buildFinalReportContext, buildDecisionTimeline, normalizeGrade } from '@/lib/final-report'
import { generateFinalReportSummary } from '@/lib/ai'
import { ChatComponent } from '@/lib/chat-components'

// Advisory-lock classid for final-report generation — distinct from the
// plant-health ledger's lock class so the two never contend with each other.
const FINAL_REPORT_LOCK_CLASS = 2

interface FinalReportRow {
  summary: string
  highlights: string[]
  growth_areas: string[]
  graded_on: string | null
  generated_at: string
}

async function fetchCachedReport(teamId: string): Promise<FinalReportRow | null> {
  return queryOne<FinalReportRow>(
    'SELECT summary, highlights, growth_areas, graded_on, generated_at FROM final_reports WHERE team_id = $1',
    [teamId]
  )
}

// A cached summary is only fresh if it was generated from the team's current
// grade — otherwise the grade renders in the header while the narrative above
// it never mentions it (or mentions a stale one).
function isReportFresh(row: FinalReportRow | null, grade: string | null): boolean {
  return row !== null && normalizeGrade(row.graded_on) === grade
}

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const membership = await requireTeamMember(code)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const teamId = membership.teamId

  const context = await buildFinalReportContext(teamId)
  const decisionTimeline = await buildDecisionTimeline(teamId, context)
  const aiReport = await fetchCachedReport(teamId)
  const grade = normalizeGrade(context.team.grade)

  return NextResponse.json({
    // Normalized grade, so a blank value typed into the DB renders as no grade
    // at all rather than an empty pill — and matches what the staleness check
    // and the prompt were built from.
    team: { ...context.team, grade },
    agreements: context.agreements,
    plantHealthHistory: context.plantHealthHistory,
    decisionTimeline,
    aiReport,
    aiReportStale: !isReportFresh(aiReport, grade),
  })
}

export async function POST(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const membership = await requireTeamMember(code)
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const teamId = membership.teamId

  // Cheapest way to know the current grade before deciding whether to
  // regenerate — buildFinalReportContext (13+ queries) is only needed on the
  // generate path below, and is already called again inside the lock.
  const teamGradeRow = await queryOne<{ grade: string | null }>('SELECT grade FROM teams WHERE id = $1', [teamId])
  const grade = normalizeGrade(teamGradeRow?.grade ?? null)

  const cached = await fetchCachedReport(teamId)
  if (isReportFresh(cached, grade)) return NextResponse.json(cached)

  // Only one concurrent request per team actually pays for the LLM call — a
  // teammate who lands on the report page at the same moment (likely, since
  // this is the page the whole team checks together) just no-ops here and
  // relies on the client's GET polling to pick up the winner's result.
  const generated = await tryWithAdvisoryLock(FINAL_REPORT_LOCK_CLASS, teamId, async () => {
    // Re-check now that we hold the lock — a prior holder may have just finished.
    const nowCached = await fetchCachedReport(teamId)
    if (isReportFresh(nowCached, grade)) return nowCached

    const context = await buildFinalReportContext(teamId)

    const agreements: Partial<Record<ChatComponent, string>> = {}
    for (const a of context.agreements) {
      if (a.finalText) agreements[a.component] = a.finalText
    }

    const missedDeadlines = context.plantHealthHistory.filter(e => e.source === 'deadline_missed').length
    const recoveredDeadlines = context.plantHealthHistory.filter(e => e.source === 'task_recovered').length
    const checkinDecrements = context.plantHealthHistory
      .filter(e => e.source === 'checkin')
      .reduce((sum, e) => sum + Math.abs(e.delta), 0)
    const finalState = context.plantHealthHistory[context.plantHealthHistory.length - 1]?.state ?? 'thriving'

    const result = await generateFinalReportSummary(
      { title: context.team.projectTitle, brief: null, grade },
      agreements,
      { missedDeadlines, recoveredDeadlines, checkinDecrements, finalState },
    )

    await query(
      `INSERT INTO final_reports (team_id, summary, highlights, growth_areas, graded_on, generated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, NOW())
       ON CONFLICT (team_id) DO UPDATE SET
         summary = EXCLUDED.summary,
         highlights = EXCLUDED.highlights,
         growth_areas = EXCLUDED.growth_areas,
         graded_on = EXCLUDED.graded_on,
         generated_at = EXCLUDED.generated_at`,
      [teamId, result.summary, JSON.stringify(result.highlights), JSON.stringify(result.growthAreas), grade]
    )

    return fetchCachedReport(teamId)
  })

  return NextResponse.json(generated ?? (await fetchCachedReport(teamId)))
}
