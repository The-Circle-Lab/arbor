'use client'

import { CHAT_COMPONENTS, COMPONENT_LABELS, ChatComponent } from '@/lib/chat-components'

interface Props {
  componentScores: Record<ChatComponent, number>
  flaggedComponents: ChatComponent[]
  perComponentNotes: Record<ChatComponent, string> | null
}

// Scores are unbounded in theory but in practice rarely exceed ~2.0 (a full
// "very_off" average plus max divergence bonus) — bars cap there so a single
// outlier component doesn't visually swamp the rest of the row.
const SCORE_CAP = 2.0

type Band = 'ok' | 'watch' | 'high'

// `flagged` can be true from a single very_off rating even when the
// averaged score is low (see computePlantState) — take it into account so
// the band pill never shows "Aligned" next to a "flagged" badge.
function bandFor(score: number, flagged: boolean): Band {
  if (score >= 1.0) return 'high'
  if (score >= 0.5 || flagged) return 'watch'
  return 'ok'
}

const BAND_PILL_STYLES: Record<Band, string> = {
  ok: 'bg-green-50 text-green-700 border-green-200',
  watch: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-red-50 text-red-700 border-red-200',
}

const BAND_LABELS: Record<Band, string> = {
  ok: 'Aligned',
  watch: 'Some tension',
  high: 'High tension',
}

const BAND_BAR_STYLES: Record<Band, string> = {
  ok: 'bg-green-500',
  watch: 'bg-amber-500',
  high: 'bg-red-500',
}

export function TensionBreakdown({ componentScores, flaggedComponents, perComponentNotes }: Props) {
  return (
    <div className="flex flex-col gap-4">
      {CHAT_COMPONENTS.map(component => {
        const score = componentScores[component] ?? 0
        const flagged = flaggedComponents.includes(component)
        const band = bandFor(score, flagged)
        const widthPct = Math.min(100, (Math.max(0, score) / SCORE_CAP) * 100)

        return (
          <div key={component} className="border border-stone-100 rounded-xl p-4">
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <p className="text-sm font-semibold text-stone-800">
                {COMPONENT_LABELS[component]}
                {flagged && <span className="ml-2 text-xs font-normal text-amber-600">⚠ flagged</span>}
              </p>
              <span className={`text-xs font-medium px-2 py-1 rounded-full border shrink-0 ${BAND_PILL_STYLES[band]}`}>
                {BAND_LABELS[band]}
              </span>
            </div>
            <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden mb-2">
              <div className={`h-full rounded-full ${BAND_BAR_STYLES[band]}`} style={{ width: `${widthPct}%` }} />
            </div>
            <p className="text-sm text-stone-600">
              {perComponentNotes?.[component] ?? <span className="text-stone-400 italic">No AI note available for this cycle yet.</span>}
            </p>
          </div>
        )
      })}
    </div>
  )
}
