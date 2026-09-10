'use client'

import { CHAT_COMPONENTS, COMPONENT_LABELS, COMPONENT_DESCRIPTIONS, ChatComponent } from '@/lib/chat-components'

interface Agreement {
  component: ChatComponent
  final_text: string | null
  resolution_note: string | null
}

interface Resolution {
  component: ChatComponent
  cycle_number: number
  resolution_note: string | null
  resolved_at: string
}

interface TeamAgreementViewProps {
  agreements: Agreement[]
  resolutions: Resolution[]
}

// Same read-only rendering as src/app/[code]/charter/page.tsx (the view a
// team sees of its own agreement), reused here so instructor/researcher
// team-detail pages show exactly what the team sees — shared component
// rather than being duplicated into src/app/instructor and src/app/researcher.
export function TeamAgreementView({ agreements, resolutions }: TeamAgreementViewProps) {
  const agreementMap = Object.fromEntries(agreements.map(a => [a.component, a]))
  const cycles = [...new Set(resolutions.map(r => r.cycle_number))].sort()

  return (
    <div>
      <div className="space-y-3 mb-6">
        <p className="text-xs text-stone-400 uppercase tracking-wide font-medium">Initial agreements</p>
        {CHAT_COMPONENTS.map(comp => {
          const ag = agreementMap[comp]
          return (
            <div key={comp} className="bg-stone-50 rounded-xl border border-stone-100 p-4">
              <div className="flex items-start justify-between gap-4 mb-1">
                <h3 className="text-sm font-semibold text-stone-700">{COMPONENT_LABELS[comp]}</h3>
                <span className="text-xs text-stone-400 shrink-0">{COMPONENT_DESCRIPTIONS[comp]}</span>
              </div>
              {ag?.final_text ? (
                <p className="text-stone-800 text-sm leading-relaxed">{ag.final_text}</p>
              ) : (
                <p className="text-stone-400 text-sm italic">No agreement recorded yet.</p>
              )}
            </div>
          )
        })}
      </div>

      {cycles.length > 0 ? (
        <div className="space-y-6">
          <p className="text-xs text-stone-400 uppercase tracking-wide font-medium">Check-in updates</p>
          {cycles.map(cycle => {
            const cycleRes = resolutions.filter(r => r.cycle_number === cycle)
            const withNotes = cycleRes.filter(r => r.resolution_note)
            return (
              <div key={cycle}>
                <p className="text-xs font-semibold text-stone-500 mb-3">Cycle {cycle}</p>
                {withNotes.length === 0 ? (
                  <p className="text-sm text-stone-400 italic">No discussion notes recorded for this cycle.</p>
                ) : (
                  <div className="space-y-3">
                    {withNotes.map(r => (
                      <div key={r.component} className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                        <p className="text-xs font-semibold text-amber-600 mb-1">{COMPONENT_LABELS[r.component]}</p>
                        <p className="text-sm text-stone-700">{r.resolution_note}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-stone-400 italic">No check-in updates yet.</p>
      )}
    </div>
  )
}
