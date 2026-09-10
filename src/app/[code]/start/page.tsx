'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, getMembership } from '@/lib/session'
import { PlantVisual, isPlantType, type PlantState, type PlantType } from '@/components/PlantVisual'
import type { CheckinAccessMode } from '@/lib/checkin-schedule'

const PLANT_STATES: PlantState[] = ['thriving', 'doing_okay', 'wilting', 'dead']

function isPlantState(value: string | null | undefined): value is PlantState {
  return value !== null && value !== undefined && PLANT_STATES.some(s => s === value)
}

interface Member {
  id: string
  display_name: string
  pronouns?: string | null
}

interface TeamData {
  name: string
  join_code: string
  plant_type: string | null
  plant_state: string | null
  members: Member[]
  checkinAccess: { mode: CheckinAccessMode; activeCycle: 1 | 2 | null }
}

const STATUS_LINE: Partial<Record<CheckinAccessMode, string>> = {
  waiting: 'Waiting for your next check-in',
  done: 'All check-ins complete',
}

export default function StartPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const { loading, user, memberships } = useSession()
  const membership = getMembership(memberships, code)

  const [teamName, setTeamName] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [plantType, setPlantType] = useState<PlantType>('default')
  // 'thriving' matches DEFAULT_LEVEL in plant-health.ts, so this is the right
  // pre-load value — no pessimistic flash before the first response.
  const [plantState, setPlantState] = useState<PlantState>('thriving')
  const [checkinMode, setCheckinMode] = useState<CheckinAccessMode | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user || !membership) { router.replace('/'); return }

    let ignore = false

    async function loadTeam() {
      const res = await fetch(`/api/teams/${code.toUpperCase()}`)
      if (!res.ok || ignore) return
      const d: TeamData = await res.json()
      if (ignore) return
      setTeamName(d.name)
      setMembers(d.members)
      if (isPlantType(d.plant_type)) setPlantType(d.plant_type)
      if (isPlantState(d.plant_state)) setPlantState(d.plant_state)
      setCheckinMode(d.checkinAccess.mode)
    }

    loadTeam()
    const interval = setInterval(loadTeam, 4000)
    return () => { ignore = true; clearInterval(interval) }
  }, [loading, user, membership, router, code])

  function copyCode() {
    navigator.clipboard.writeText(code.toUpperCase())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const statusLine = checkinMode ? STATUS_LINE[checkinMode] : undefined

  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-stone-800">{teamName || 'Your team'}</h1>
          {statusLine && <p className="text-stone-500 text-sm mt-1">{statusLine}</p>}
        </div>

        <div className="flex justify-center mb-6">
          <PlantVisual state={plantState} plantType={plantType} size={160} />
        </div>

        {/* Members */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-stone-400 uppercase tracking-wide font-medium">
              Team ({members.length})
            </p>
            <button
              onClick={copyCode}
              className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-600 transition"
            >
              <span className="font-mono font-semibold tracking-wider text-stone-500">{code.toUpperCase()}</span>
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-semibold text-sm">
                  {m.display_name[0].toUpperCase()}
                </div>
                <span className="text-stone-700 text-sm font-medium">{m.display_name}</span>
                {m.pronouns && m.pronouns !== 'prefer not to say' && (
                  <span className="text-xs text-stone-400">{m.pronouns}</span>
                )}
                {m.id === membership?.member_id && (
                  <span className="text-xs text-stone-400">(you)</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => router.push(`/${code}/charter`)}
            className="w-full bg-green-700 text-white rounded-xl py-3.5 text-sm font-semibold hover:bg-green-800 transition"
          >
            View team agreement
          </button>
          <button
            onClick={() => router.push(`/${code}/plant-history`)}
            className="w-full bg-white border border-stone-200 text-stone-700 rounded-xl py-3.5 text-sm font-semibold hover:bg-stone-50 transition"
          >
            View plant health history
          </button>
        </div>
      </div>
    </main>
  )
}
