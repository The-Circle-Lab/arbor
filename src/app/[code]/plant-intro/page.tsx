'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, getMembership } from '@/lib/session'
import { PlantVisual, PlantType } from '@/components/PlantVisual'

export default function PlantIntroPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const { loading, user, memberships } = useSession()
  const membership = getMembership(memberships, code)
  const [step, setStep] = useState(0)
  const [plantType, setPlantType] = useState<PlantType>('default')

  useEffect(() => {
    if (loading) return
    if (!user || !membership) { router.replace('/'); return }
    fetch(`/api/teams/${code.toUpperCase()}`)
      .then(r => r.json())
      .then(d => { if (d.plant_type) setPlantType(d.plant_type as PlantType) })
  }, [loading, user, membership, router, code])

  const steps = [
    {
      heading: 'Meet your plant.',
      body: 'This is your team\'s collaboration health, made visible. It grows when your team is aligned, and wilts when tension builds.',
      cta: 'Got it →',
    },
    {
      heading: 'Keep it alive.',
      body: 'After each working session or meeting, you\'ll come back to Arbour to check in. Your answers shape the plant. Honest ratings help: this is just for your team.',
      cta: 'Makes sense →',
    },
    {
      heading: 'Go do your project.',
      body: 'Come back here after your first real working session or team meeting. That\'s when your first check-in happens, not right now.',
      cta: 'We\'re ready to check in now →',
      secondary: 'We\'ll come back later',
    },
  ]

  const current = steps[step]
  const isLast = step === steps.length - 1

  function handleCta() {
    if (isLast) {
      router.push(`/${code}/checkin/1`)
    } else {
      setStep(s => s + 1)
    }
  }

  function handleLater() {
    // Go back to hub — they'll check in when they return
    router.push(`/${code}`)
  }

  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-10">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all ${i === step ? 'bg-green-700 w-5' : 'bg-stone-300'}`}
            />
          ))}
        </div>

        {/* Plant visual — always thriving on intro */}
        <div className="flex justify-center mb-8">
          <PlantVisual state="thriving" plantType={plantType} size={140} />
        </div>

        <h1 className="text-2xl font-bold text-stone-800 mb-3">{current.heading}</h1>
        <p className="text-stone-500 text-sm leading-relaxed mb-8">{current.body}</p>

        <button
          onClick={handleCta}
          className="w-full bg-green-700 text-white rounded-xl py-4 text-base font-medium hover:bg-green-800 transition"
        >
          {current.cta}
        </button>

      </div>
    </main>
  )
}
