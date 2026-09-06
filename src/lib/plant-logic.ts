import { CHAT_COMPONENTS, ChatComponent, Rating, RATING_VALUES } from './chat-components'

// Lower threshold so any single slightly_off in a 2-person team gets flagged
const FLAG_THRESHOLD = 0.5
const DIVERGENCE_BONUS_LARGE = 0.5  // one aligned, one very_off
const DIVERGENCE_BONUS_SMALL = 0.25 // one aligned, one slightly_off

// Calibrated as fractions of CHAT_COMPONENTS.length (5): thriving 0%,
// doing_okay up to 40%, wilting up to 60%, dead above that — close to the
// original 0%/33%/67% split from when there were 6 flaggable components.
const STATE_THRESHOLDS = {
  thriving: 0,   // 0 flagged
  doing_okay: 2, // 1-2 flagged
  wilting: 3,    // 3 flagged
} as const

export interface CheckinRow {
  component: ChatComponent
  response_data: {
    ratings?: Record<string, Rating>
    rating?: Rating
    [key: string]: unknown
  }
}

function getWorstRating(data: CheckinRow['response_data']): Rating | null {
  if (data.rating) return data.rating
  if (data.ratings) {
    const vals = Object.values(data.ratings) as Rating[]
    if (vals.includes('very_off')) return 'very_off'
    if (vals.includes('slightly_off')) return 'slightly_off'
    if (vals.length > 0) return 'aligned'
  }
  return null
}

export interface PlantResult {
  state: 'thriving' | 'doing_okay' | 'wilting' | 'dead'
  flaggedComponents: ChatComponent[]
  componentScores: Record<ChatComponent, number>
}

// How many levels a check-in cycle's flagged-component count should knock off
// the team's *current* unified plant level (stacked on top of whatever task
// events already did to it), not an absolute state on its own.
export function flagCountToLevelDrop(flagCount: number): number {
  if (flagCount <= 0) return 0
  if (flagCount <= 2) return 1
  if (flagCount <= 3) return 2
  return 3
}

export function computePlantState(checkins: CheckinRow[], teamSize: number): PlantResult {
  const componentScores: Record<ChatComponent, number> = {} as Record<ChatComponent, number>

  for (const component of CHAT_COMPONENTS) {
    const memberCheckins = checkins.filter(c => c.component === component)
    const ratings = memberCheckins.map(c => getWorstRating(c.response_data)).filter((r): r is Rating => r !== null)

    if (ratings.length === 0) {
      componentScores[component] = 0
      continue
    }

    const numericVals = ratings.map(r => RATING_VALUES[r])
    const avg = numericVals.reduce((a, b) => a + b, 0) / numericVals.length

    let divergenceBonus = 0
    if (teamSize > 1) {
      for (let i = 0; i < ratings.length; i++) {
        for (let j = i + 1; j < ratings.length; j++) {
          const diff = Math.abs(RATING_VALUES[ratings[i]] - RATING_VALUES[ratings[j]])
          if (diff === 2) divergenceBonus += DIVERGENCE_BONUS_LARGE / (teamSize - 1)
          else if (diff === 1) divergenceBonus += DIVERGENCE_BONUS_SMALL / (teamSize - 1)
        }
      }
    }

    componentScores[component] = avg + divergenceBonus
  }

  const flaggedComponents = CHAT_COMPONENTS.filter(component => {
    const score = componentScores[component]
    const memberCheckins = checkins.filter(c => c.component === component)
    const ratings = memberCheckins.map(c => getWorstRating(c.response_data)).filter((r): r is Rating => r !== null)
    const anyVeryOff = ratings.includes('very_off')
    return score >= FLAG_THRESHOLD || anyVeryOff
  })

  const flagCount = flaggedComponents.length
  let state: PlantResult['state']
  if (flagCount <= STATE_THRESHOLDS.thriving) {
    state = 'thriving'
  } else if (flagCount <= STATE_THRESHOLDS.doing_okay) {
    state = 'doing_okay'
  } else if (flagCount <= STATE_THRESHOLDS.wilting) {
    state = 'wilting'
  } else {
    state = 'dead'
  }

  return { state, flaggedComponents, componentScores }
}
