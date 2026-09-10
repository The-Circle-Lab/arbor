'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, getMembership } from '@/lib/session'
import { PlantVisual, PlantState, PlantType, STATE_COLORS } from '@/components/PlantVisual'
import { WaitingRoom } from '@/components/WaitingRoom'
import { COMPONENT_LABELS, ChatComponent } from '@/lib/chat-components'

interface PlantData {
  computed_state: PlantState
  flagged_components: ChatComponent[]
  per_component?: Record<string, string>
}

export default function PlantPage() {
  const { code, cycle } = useParams<{ code: string; cycle: string }>()
  const router = useRouter()
  const { loading, user, memberships } = useSession()
  const membership = getMembership(memberships, code)
  const cycleNum = parseInt(cycle)

  const [plantData, setPlantData] = useState<PlantData | null>(null)
  const [plantType, setPlantType] = useState<PlantType>('default')
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user || !membership) { router.replace('/'); return }

    async function loadAll() {
      const teamRes = await fetch(`/api/teams/${code.toUpperCase()}`)
      if (!teamRes.ok) return
      const teamData = await teamRes.json()
      if (teamData.plant_type) setPlantType(teamData.plant_type as PlantType)

      const plantRes = await fetch(`/api/plant/${code.toUpperCase()}/${cycleNum}`)
      if (plantRes.ok) {
        const data = await plantRes.json()
        if (data.computed_state) setPlantData(data)
      }
    }

    loadAll()
    const interval = setInterval(loadAll, 4000)
    return () => clearInterval(interval)
  }, [loading, user, membership, code, cycleNum])

  // No tensions: let the team see the healthy plant, then move on.
  useEffect(() => {
    if (!plantData || plantData.flagged_components.length > 0) return
    const t = setTimeout(() => {
      if (cycleNum === 1) router.push(`/${code}/checkin-intro`)
      else router.push(`/${code}/start`)
    }, 2500)
    return () => clearTimeout(t)
  }, [plantData, cycleNum, code, router])

  if (!plantData) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <WaitingRoom
          message="Computing plant state"
          subMessage="Analysing your team's check-in responses…"
        />
      </main>
    )
  }

  const flagged = plantData.flagged_components

  return (
    <main className={`min-h-screen ${STATE_COLORS[plantData.computed_state].bg} p-6 flex flex-col items-center`}>
      <div className="w-full max-w-xl">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-stone-400 uppercase tracking-wide font-medium">{`Cycle ${cycleNum} · Team health`}</p>
          <button
            onClick={() => router.push(`/${code}/charter`)}
            className="text-xs text-stone-400 hover:text-stone-600 underline"
          >
            View agreement
          </button>
        </div>

        <div className="flex flex-col items-center my-8">
          <PlantVisual
            state={plantData.computed_state}
            plantType={plantType}
            onClick={flagged.length > 0 ? () => setRevealed(r => !r) : undefined}
            size={180}
          />
          {flagged.length > 0 && !revealed && (
            <p className="text-sm text-stone-400 mt-3">Tap the plant to see what&apos;s off</p>
          )}
        </div>

        {flagged.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 text-center">
            <p className="text-green-700 font-medium">Your team is aligned: no tensions detected.</p>
          </div>
        ) : revealed && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
            <h3 className="text-sm font-semibold text-stone-700 mb-3">What&apos;s off</h3>
            <div className="flex flex-col gap-3 mb-5">
              {flagged.map(comp => (
                <div key={comp} className="border border-amber-200 bg-amber-50 rounded-xl px-4 py-3">
                  <p className="text-sm font-medium text-stone-800 mb-1">{COMPONENT_LABELS[comp]}</p>
                  {plantData.per_component?.[comp] && (
                    <p className="text-xs text-amber-900">{plantData.per_component[comp]}</p>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => router.push(`/${code}/checkin-agree/${cycleNum}`)}
              className="w-full bg-stone-800 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-stone-900 transition"
            >
              Discuss and re-align →
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
