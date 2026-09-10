'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, getMembership } from '@/lib/session'
import { isPlantType, type PlantType } from '@/components/PlantVisual'
import { PlantHealthTimeline, type PlantHealthEntry } from '@/components/PlantHealthTimeline'

interface PlantHistoryData {
  team: { name: string; plantType: string | null }
  plantHealthHistory: PlantHealthEntry[]
}

export default function PlantHistoryPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const { loading: sessionLoading, user, memberships } = useSession()
  const membership = getMembership(memberships, code)

  const [data, setData] = useState<PlantHistoryData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (sessionLoading) return
    if (!user || !membership) { router.replace('/'); return }

    async function load() {
      const res = await fetch(`/api/final-report/${code.toUpperCase()}`)
      if (!res.ok) { setLoading(false); return }
      const d: PlantHistoryData = await res.json()
      setData(d)
      setLoading(false)
    }
    load()
  }, [sessionLoading, user, membership, code, router])

  if (loading || !data) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-400 text-sm">Loading…</p>
      </main>
    )
  }

  const plantType: PlantType = isPlantType(data.team.plantType) ? data.team.plantType : 'default'

  return (
    <main className="min-h-screen bg-stone-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <button onClick={() => router.back()} className="text-xs text-stone-400 hover:text-stone-600 mb-4 block">
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-stone-800">{`${data.team.name}: Plant Health History`}</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
          <h2 className="text-lg font-bold text-stone-800 mb-4">Plant health over time</h2>
          <PlantHealthTimeline history={data.plantHealthHistory} plantType={plantType} />
        </div>
      </div>
    </main>
  )
}
