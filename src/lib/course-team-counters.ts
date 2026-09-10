import { query } from '@/lib/db'
import { CHAT_COMPONENTS } from '@/lib/chat-components'

export interface CourseTeamCounters {
  teamCount: number
  memberCount: number
  reflectionsCompleteCount: number
  agreementsCompleteCount: number
}

function toNumber(value: number | string | null): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export async function getCourseTeamCounters(courseId: string): Promise<CourseTeamCounters> {
  const rows = await query<{
    team_count: number | string | null
    member_count: number | string | null
    reflections_complete_count: number | string | null
    agreements_complete_count: number | string | null
  }>(
    `WITH course_teams AS (
       SELECT id FROM teams WHERE course_id = $1
     ),
     member_counts AS (
       SELECT m.team_id, COUNT(*)::int AS member_count
       FROM members m
       JOIN course_teams ct ON ct.id = m.team_id
       GROUP BY m.team_id
     ),
     member_reflection_totals AS (
       SELECT m.team_id, ir.member_id, COUNT(DISTINCT ir.component)::int AS component_count
       FROM individual_reflections ir
       JOIN members m ON m.id = ir.member_id
       JOIN course_teams ct ON ct.id = m.team_id
       GROUP BY m.team_id, ir.member_id
     ),
     team_reflected_counts AS (
       SELECT team_id, COUNT(*)::int AS reflected_count
       FROM member_reflection_totals
       WHERE component_count = $2
       GROUP BY team_id
     ),
     team_agreement_components AS (
       SELECT a.team_id, a.component, COUNT(DISTINCT aa.member_id)::int AS approvals
       FROM agreements a
       JOIN course_teams ct ON ct.id = a.team_id
       LEFT JOIN agreement_approvals aa ON aa.team_id = a.team_id AND aa.component = a.component
       GROUP BY a.team_id, a.component
     ),
     team_agreement_status AS (
       SELECT tac.team_id, COUNT(*)::int AS component_count,
              BOOL_AND(tac.approvals >= COALESCE(mc.member_count, 0)) AS all_approved
       FROM team_agreement_components tac
       JOIN member_counts mc ON mc.team_id = tac.team_id
       GROUP BY tac.team_id
     )
     SELECT
       (SELECT COUNT(*) FROM course_teams) AS team_count,
       (SELECT COALESCE(SUM(member_count), 0) FROM member_counts) AS member_count,
       (SELECT COUNT(*)
        FROM member_counts mc
        LEFT JOIN team_reflected_counts trc ON trc.team_id = mc.team_id
        WHERE mc.member_count > 0 AND COALESCE(trc.reflected_count, 0) >= mc.member_count
       ) AS reflections_complete_count,
       (SELECT COUNT(*)
        FROM team_agreement_status tas
        WHERE tas.component_count = $2 AND tas.all_approved
       ) AS agreements_complete_count`,
    [courseId, CHAT_COMPONENTS.length]
  )

  const row = rows[0]
  if (!row) {
    return { teamCount: 0, memberCount: 0, reflectionsCompleteCount: 0, agreementsCompleteCount: 0 }
  }

  return {
    teamCount: toNumber(row.team_count),
    memberCount: toNumber(row.member_count),
    reflectionsCompleteCount: toNumber(row.reflections_complete_count),
    agreementsCompleteCount: toNumber(row.agreements_complete_count),
  }
}
