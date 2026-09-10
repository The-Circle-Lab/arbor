'use client'

import { COMPONENT_LABELS, ChatComponent } from '@/lib/chat-components'
import { PlantVisual, STATE_LABELS, type PlantType, type PlantState } from '@/components/PlantVisual'

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

const SOURCE_LABELS: Record<PlantHealthEntry['source'], string> = {
  deadline_missed: 'Deadline missed',
  task_recovered: 'Task completed',
  checkin: 'Check-in',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

interface PlantHealthTimelineProps {
  history: PlantHealthEntry[]
  plantType: PlantType
}

export function PlantHealthTimeline({ history, plantType }: PlantHealthTimelineProps) {
  if (history.length === 0) {
    return <p className="text-sm text-stone-400 italic">Nothing changed the plant&apos;s health this project.</p>
  }

  return (
    <div className="space-y-3">
      {history.map((entry, i) => {
        const flagged = entry.flaggedComponents ?? []
        const perComponent = entry.perComponent
        return (
          <div key={i} className="flex gap-4 items-start bg-stone-50 rounded-xl p-4">
            <PlantVisual state={entry.state} plantType={plantType} size={56} hideLabel />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{SOURCE_LABELS[entry.source]}</span>
                <span className="text-xs text-stone-400">{formatDate(entry.occurredAt)}</span>
                <span className="text-xs font-medium text-stone-600">→ {STATE_LABELS[entry.state]}</span>
              </div>
              {entry.source === 'checkin' && (
                <div className="text-sm text-stone-700">
                  {flagged.length > 0 ? (
                    <p>Flagged: {flagged.map(c => COMPONENT_LABELS[c]).join(', ')}</p>
                  ) : (
                    <p className="text-stone-400 italic">No components flagged.</p>
                  )}
                  {perComponent && flagged.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {flagged.map(c => (
                        <p key={c} className="text-xs text-stone-500">
                          <span className="font-medium">{COMPONENT_LABELS[c]}:</span> {perComponent[c]}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
