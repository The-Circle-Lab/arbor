'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, getMembership } from '@/lib/session'
import { PlantVisual, PlantType } from '@/components/PlantVisual'

export default function CheckinIntroPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const { loading, user, memberships } = useSession()
  const membership = getMembership(memberships, code)
  const [plantType, setPlantType] = useState<PlantType>('default')

  useEffect(() => {
    if (loading) return
    if (!user || !membership) { router.replace('/'); return }
    fetch(`/api/teams/${code.toUpperCase()}`)
      .then(r => r.json())
      .then(d => { if (d.plant_type) setPlantType(d.plant_type as PlantType) })
  }, [loading, user, membership, router, code])

  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-8">
          <PlantVisual state="doing_okay" plantType={plantType} size={140} />
        </div>

        <h1 className="text-2xl font-bold text-stone-800 mb-3">Time to check in.</h1>
        <p className="text-stone-500 text-sm leading-relaxed mb-2">
          You've had a working session. Let's see how the collaboration is holding up.
        </p>
        <p className="text-stone-500 text-sm leading-relaxed mb-8">
          Each person answers independently, then Arbour shows you where things are aligned and where tension is building.
        </p>

        <button
          onClick={() => router.push(`/${code}/checkin/2`)}
          className="w-full bg-green-700 text-white rounded-xl py-4 text-base font-medium hover:bg-green-800 transition"
        >
          Start check-in →
        </button>
      </div>
    </main>
  )
}
