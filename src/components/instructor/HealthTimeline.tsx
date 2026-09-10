'use client'

import type { PlantHealthSource } from '@/lib/plant-health'

export interface HealthEvent {
  occurred_at: string
  level: number
  delta: number
  source: PlantHealthSource
  cycle_number: number | null
}

interface Props {
  events: HealthEvent[]
}

// Index = level (0-3), echoing PlantVisual's dead/wilting/doing_okay/thriving
// state palette so a color here means the same thing it does on the plant.
const LEVEL_COLORS = ['bg-red-600', 'bg-amber-500', 'bg-lime-500', 'bg-green-600']
const LEVEL_LABELS = ['Dead', 'Wilting', 'Doing okay', 'Thriving']

const SOURCE_LABELS: Record<PlantHealthSource, string> = {
  deadline_missed: 'Deadline missed',
  task_recovered: 'Task completed',
  checkin: 'Check-in',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Dependency-free bar-per-event chart (divs + Tailwind only) — no chart
// library is installed in this app, so the health-over-time chart has to be
// built from scratch.
export function HealthTimeline({ events }: Props) {
  if (events.length === 0) {
    return <p className="text-sm text-stone-400 italic">Nothing has changed this team&apos;s plant health yet.</p>
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-2 min-w-max pb-2" style={{ height: 120 }}>
        {events.map((event, i) => (
          <div key={i} className="flex flex-col items-end justify-end gap-1 w-10 shrink-0" style={{ height: '100%' }}>
            <div
              className={`w-6 rounded-t-md ${LEVEL_COLORS[event.level] ?? 'bg-stone-300'}`}
              style={{ height: `${Math.max(10, (event.level + 1) * 24)}px` }}
              title={`${LEVEL_LABELS[event.level] ?? 'Unknown'} — ${SOURCE_LABELS[event.source]} on ${formatDate(event.occurred_at)}`}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 min-w-max">
        {events.map((event, i) => (
          <span key={i} className="text-[10px] text-stone-400 w-10 shrink-0 text-center whitespace-nowrap">
            {formatDate(event.occurred_at)}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-4">
        {LEVEL_LABELS.map((label, level) => (
          <span key={label} className="flex items-center gap-1.5 text-xs text-stone-500">
            <span className={`w-2.5 h-2.5 rounded-full ${LEVEL_COLORS[level]}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
