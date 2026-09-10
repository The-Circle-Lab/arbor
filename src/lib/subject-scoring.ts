import { SUBJECT_QUESTIONS } from './chat-components'

export interface SubjectResponses {
  position?: string[]
  voice?: string
  [key: string]: unknown
}

// TODO: once a test suite exists, add a unit test that calls this for both
// 'position' and 'voice' to catch drift between SUBJECT_QUESTIONS and the
// POSITION_POINTS/VOICE_POINTS maps in CI instead of at first production request.
function assertPointsMatchQuestion(questionId: string, points: Record<string, number>): void {
  const question = SUBJECT_QUESTIONS.find(q => q.id === questionId)
  if (!question || !question.options) throw new Error(`Missing options for subject question "${questionId}"`)
  const expected = question.options.filter(option => option !== 'Other')
  const missing = expected.filter(option => !(option in points))
  const extra = Object.keys(points).filter(option => !expected.includes(option))
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Scoring points for "${questionId}" are out of sync with SUBJECT_QUESTIONS. ` +
        `Missing: [${missing.join(', ')}]. Extra: [${extra.join(', ')}].`
    )
  }
}

export const POSITION_POINTS: Record<string, number> = {
  'Proposed a direction and got others on board': 6,
  'Kept the group organized and on schedule': 5,
  'Took a defined piece and ran it independently': 4,
  'Moved between tasks depending on what was needed': 3,
  'Took what was assigned and delivered it': 2,
  'Filled whatever was left once others had chosen': 1,
}
assertPointsMatchQuestion('position', POSITION_POINTS)

export const VOICE_POINTS: Record<string, number> = {
  'Said so in the group conversation': 4,
  'Raised it with one person separately': 3,
  'Waited to see whether someone else would raise it': 2,
  'Went along with it and adjusted my own work around it': 1,
}
assertPointsMatchQuestion('voice', VOICE_POINTS)

export interface SubjectScores {
  position: number | null
  voice: number | null
}

export function computeSubjectScores(subjectResponses: SubjectResponses): SubjectScores {
  const positionAnswers = Array.isArray(subjectResponses.position) ? subjectResponses.position : []
  const positionValues = positionAnswers
    .map(answer => POSITION_POINTS[answer])
    .filter((value): value is number => value !== undefined)
  const position = positionValues.length > 0 ? Math.max(...positionValues) : null

  const voiceAnswer = subjectResponses.voice
  const voice = typeof voiceAnswer === 'string' ? (VOICE_POINTS[voiceAnswer] ?? null) : null

  return { position, voice }
}

export type EngagementLevel = 'low' | 'medium' | 'high'

export interface TeamEngagementLevel {
  positionSpread: number | null
  voiceDenominator: number
  voiceBelowV4: number
  level: EngagementLevel
}

export function computeTeamSubjectLevel(subjectResponses: SubjectResponses[]): TeamEngagementLevel {
  const scores = subjectResponses.map(computeSubjectScores)

  const positionValues = scores
    .map(s => s.position)
    .filter((value): value is number => value !== null)
  const positionSpread =
    positionValues.length >= 2 ? Math.max(...positionValues) - Math.min(...positionValues) : null

  const voiceValues = scores
    .map(s => s.voice)
    .filter((value): value is number => value !== null)
  const voiceDenominator = voiceValues.length
  const voiceBelowV4 = voiceValues.filter(value => value < 4).length

  const isWide = positionSpread !== null && positionSpread >= 3

  const level: EngagementLevel =
    isWide && voiceBelowV4 >= Math.floor(voiceDenominator / 2) && voiceBelowV4 >= 1
      ? 'high'
      : isWide || voiceBelowV4 >= 1
        ? 'medium'
        : 'low'

  return { positionSpread, voiceDenominator, voiceBelowV4, level }
}

export interface MemberVoiceScore {
  memberId: string
  displayName: string
  voiceScore: number | null
}

export interface FacilitationOrderEntry {
  memberId: string
  displayName: string
}

// Opener = lowest voice score that is < 4, tiebreak by member id ASC.
// If nobody scored below 4 (including "nobody answered voice at all"), the
// opener falls back to whoever is first in normal joined_at order (`members`
// is already sorted that way). Everyone else — including a missing-score
// member — is then ordered ascending by voice score, id ASC tiebreak
// throughout; a null voice score sorts last (treated as +Infinity) since
// "never answered" isn't "below v4" and shouldn't jump the queue.
export function computeFacilitationOrder(members: MemberVoiceScore[]): FacilitationOrderEntry[] {
  if (members.length === 0) return []

  const candidates = members.filter(m => m.voiceScore !== null && m.voiceScore < 4)
  const opener = candidates.length > 0
    ? candidates.reduce((best, m) => {
        const mScore = m.voiceScore
        const bestScore = best.voiceScore
        if (mScore === null || bestScore === null) return best
        if (mScore < bestScore) return m
        if (mScore === bestScore && m.memberId < best.memberId) return m
        return best
      })
    : members[0]

  const rest = members
    .filter(m => m.memberId !== opener.memberId)
    .sort((a, b) => {
      const av = a.voiceScore === null ? Number.POSITIVE_INFINITY : a.voiceScore
      const bv = b.voiceScore === null ? Number.POSITIVE_INFINITY : b.voiceScore
      if (av !== bv) return av - bv
      if (a.memberId < b.memberId) return -1
      if (a.memberId > b.memberId) return 1
      return 0
    })

  return [
    { memberId: opener.memberId, displayName: opener.displayName },
    ...rest.map(m => ({ memberId: m.memberId, displayName: m.displayName })),
  ]
}
