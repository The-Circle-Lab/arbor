import { query } from './db'

export interface SubjectResponses {
  position?: string[]
  voice?: string
  [key: string]: unknown
}

export const POSITION_POINTS: Record<string, number> = {
  'Proposed a direction and got others on board': 6,
  'Kept the group organized and on schedule': 5,
  'Took a defined piece and ran it independently': 4,
  'Moved between tasks depending on what was needed': 3,
  'Took what was assigned and delivered it': 2,
  'Filled whatever was left once others had chosen': 1,
}

export const VOICE_POINTS: Record<string, number> = {
  'Said so in the group conversation': 4,
  'Raised it with one person separately': 3,
  'Waited to see whether someone else would raise it': 2,
  'Went along with it and adjusted my own work around it': 1,
}

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
