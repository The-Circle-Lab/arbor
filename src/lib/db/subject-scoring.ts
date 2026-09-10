import { query } from '@/lib/db'
import { getTeamSubjectResponses } from '@/lib/team-members'
import {
  SubjectResponses,
  TeamEngagementLevel,
  MemberVoiceScore,
  computeSubjectScores,
  computeTeamSubjectLevel,
} from '@/lib/subject-scoring'

export async function storeTeamEngagementLevel(teamId: string, level: TeamEngagementLevel): Promise<void> {
  await query(
    `UPDATE teams
     SET position_spread = $2, voice_denominator = $3, voice_below_v4 = $4, engagement_level = $5
     WHERE id = $1`,
    [teamId, level.positionSpread, level.voiceDenominator, level.voiceBelowV4, level.level]
  )
}

export async function refreshTeamEngagementLevel(teamId: string): Promise<TeamEngagementLevel> {
  const subjectResponses = await getTeamSubjectResponses(teamId)
  const level = computeTeamSubjectLevel(subjectResponses)
  await storeTeamEngagementLevel(teamId, level)
  return level
}

// joined_at ASC, id ASC — same "team's normal member order" getTeamMembers
// uses, with id as the deterministic tiebreak idiom already used elsewhere
// (plant_health_events reads: ORDER BY value, id).
export async function getTeamMemberVoiceScores(teamId: string): Promise<MemberVoiceScore[]> {
  const rows = await query<{ id: string; display_name: string; subject_responses: SubjectResponses }>(
    `SELECT m.id, u.display_name, m.subject_responses
     FROM members m
     JOIN users u ON u.id = m.user_id
     WHERE m.team_id = $1
     ORDER BY m.joined_at ASC, m.id ASC`,
    [teamId]
  )
  return rows.map(r => ({
    memberId: r.id,
    displayName: r.display_name,
    voiceScore: computeSubjectScores(r.subject_responses).voice,
  }))
}
