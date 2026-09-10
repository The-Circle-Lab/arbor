'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PlantVisual, isPlantType, STATE_LABELS, type PlantState, type PlantType } from '@/components/PlantVisual'
import { TensionBreakdown } from '@/components/instructor/TensionBreakdown'
import { HealthTimeline, type HealthEvent } from '@/components/instructor/HealthTimeline'
import { ChatComponent } from '@/lib/chat-components'
import { STAGE_LABELS } from '@/lib/team-stage'

interface Member {
  id: string
  display_name: string
  pronouns: string | null
  joined_at: string
}

interface TeamStatus {
  stage: number
  teamSize: number
}

interface TeamInfo {
  id: string
  name: string
  join_code: string
  project_title: string | null
  deadline: string | null
  plant_type: string | null
  project_manager_id: string | null
  members: Member[]
  status: TeamStatus
}

interface HealthData {
  events: HealthEvent[]
  currentState: PlantState
}

interface TensionData {
  state: PlantState
  flaggedComponents: ChatComponent[]
  componentScores: Record<ChatComponent, number>
  perComponentNotes: Record<ChatComponent, string> | null
}

type TensionStatus =
  | { kind: 'loading' }
  | { kind: 'not_ready' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: TensionData }

interface SummaryRow {
  team_id: string
  cycle_number: number
  summary: string
  watch_points: string[]
  generated_at: string
}

export default function InstructorTeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>()
  const router = useRouter()

  const [team, setTeam] = useState<TeamInfo | null>(null)
  const [health, setHealth] = useState<HealthData | null>(null)
  const [availableCycles, setAvailableCycles] = useState<number[]>([])
  const [selectedCycle, setSelectedCycle] = useState<number | null>(null)
  const [tensionStatus, setTensionStatus] = useState<TensionStatus>({ kind: 'loading' })
  const [summary, setSummary] = useState<SummaryRow | null>(null)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let ignore = false
    async function load() {
      try {
        const [teamRes, healthRes, cyclesRes] = await Promise.all([
          fetch(`/api/instructor/teams/${teamId}`),
          fetch(`/api/instructor/teams/${teamId}/health`),
          fetch(`/api/instructor/teams/${teamId}/cycles`),
        ])
        if (ignore) return
        if (!teamRes.ok || !healthRes.ok || !cyclesRes.ok) { setNotFound(true); return }

        const teamData: TeamInfo = await teamRes.json()
        const healthData: HealthData = await healthRes.json()
        const cyclesData: { availableCycles: number[] } = await cyclesRes.json()
        if (ignore) return

        setTeam(teamData)
        setHealth(healthData)
        setAvailableCycles(cyclesData.availableCycles)
        setSelectedCycle(cyclesData.availableCycles[cyclesData.availableCycles.length - 1] ?? null)
      } catch (e) {
        if (!ignore) setLoadError(e instanceof Error ? e.message : 'Something went wrong.')
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    load()
    return () => { ignore = true }
  }, [teamId])

  const latestCycleRef = useRef<number | null>(null)

  const loadTension = useCallback(async (cycle: number) => {
    latestCycleRef.current = cycle
    setTensionStatus({ kind: 'loading' })
    setSummary(null)
    setSummaryError('')
    try {
      // Fired together — the summary fetch doesn't depend on the tension
      // response, so there's no reason to pay their latencies back-to-back.
      const [res, summaryRes] = await Promise.all([
        fetch(`/api/instructor/teams/${teamId}/tension/${cycle}`),
        fetch(`/api/instructor/teams/${teamId}/summary/${cycle}`),
      ])
      if (latestCycleRef.current !== cycle) return
      if (res.status === 202) { setTensionStatus({ kind: 'not_ready' }); return }
      if (!res.ok) { setTensionStatus({ kind: 'error', message: 'Could not load the tension breakdown for this cycle.' }); return }
      const data: TensionData = await res.json()
      if (latestCycleRef.current !== cycle) return
      setTensionStatus({ kind: 'ready', data })

      if (summaryRes.ok) {
        const summaryData: { cached: SummaryRow | null } = await summaryRes.json()
        if (latestCycleRef.current !== cycle) return
        setSummary(summaryData.cached)
      }
    } catch {
      if (latestCycleRef.current === cycle) {
        setTensionStatus({ kind: 'error', message: 'Could not load the tension breakdown for this cycle.' })
      }
    }
  }, [teamId])

  useEffect(() => {
    if (selectedCycle === null) return
    loadTension(selectedCycle)
  }, [selectedCycle, loadTension])

  async function handleGenerateSummary() {
    if (selectedCycle === null) return
    const cycle = selectedCycle
    setGeneratingSummary(true)
    setSummaryError('')
    try {
      const res = await fetch(`/api/instructor/teams/${teamId}/summary/${cycle}`, { method: 'POST' })
      if (latestCycleRef.current !== cycle) return
      if (res.status === 202 || !res.ok) { setSummaryError('Could not generate a summary for this cycle.'); return }
      const data: SummaryRow = await res.json()
      if (latestCycleRef.current !== cycle) return
      setSummary(data)
    } catch {
      if (latestCycleRef.current === cycle) setSummaryError('Could not generate a summary for this cycle.')
    } finally {
      setGeneratingSummary(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-400 text-sm">Loading…</p>
      </main>
    )
  }

  if (loadError) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-stone-500 text-sm mb-3">{loadError}</p>
          <button onClick={() => window.location.reload()} className="text-xs text-green-700 hover:text-green-800 font-medium">
            Try again
          </button>
        </div>
      </main>
    )
  }

  if (notFound || !team || !health) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-500 text-sm">This team isn&apos;t in one of your courses.</p>
      </main>
    )
  }

  const plantType: PlantType = isPlantType(team.plant_type) ? team.plant_type : 'default'

  return (
    <main className="min-h-screen bg-stone-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <button onClick={() => router.push('/instructor')} className="text-xs text-stone-400 hover:text-stone-600 mb-4 block">
          ← Back to all groups
        </button>

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mb-6 flex items-center gap-6 flex-wrap">
          <PlantVisual state={health.currentState} plantType={plantType} size={96} hideLabel />
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-2xl font-bold text-stone-800">{team.name}</h1>
            <p className="text-stone-500 text-sm mt-1">{team.project_title ?? 'No project title set'}</p>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-xs font-medium px-2.5 py-1 rounded-full border bg-stone-50 text-stone-600 border-stone-200">
                {STATE_LABELS[health.currentState]}
              </span>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
                {STAGE_LABELS[team.status.stage] ?? `Stage ${team.status.stage}`}
              </span>
              <span className="text-xs text-stone-400 font-mono">{team.join_code}</span>
            </div>
          </div>
        </div>

        {/* Members */}
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mb-6">
          <h2 className="text-lg font-bold text-stone-800 mb-4">Members</h2>
          {team.members.length === 0 ? (
            <p className="text-sm text-stone-400 italic">No members have joined yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {team.members.map(member => (
                <li key={member.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-stone-700">
                    {member.display_name}
                    {member.pronouns && <span className="text-stone-400"> · {member.pronouns}</span>}
                  </span>
                  {member.id === team.project_manager_id && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200">
                      Project manager
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Cycle tabs + tension breakdown */}
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mb-6">
          <h2 className="text-lg font-bold text-stone-800 mb-4">Tension breakdown</h2>

          {availableCycles.length === 0 ? (
            <p className="text-sm text-stone-400 italic">No check-in data yet.</p>
          ) : (
            <>
              <div className="flex gap-2 mb-5">
                {availableCycles.map(cycle => (
                  <button
                    key={cycle}
                    onClick={() => setSelectedCycle(cycle)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                      selectedCycle === cycle ? 'bg-green-700 text-white' : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    Cycle {cycle}
                  </button>
                ))}
              </div>

              {tensionStatus.kind === 'error' && (
                <div className="text-center">
                  <p className="text-stone-500 text-sm mb-3">{tensionStatus.message}</p>
                  <button
                    onClick={() => selectedCycle !== null && loadTension(selectedCycle)}
                    className="text-xs text-green-700 hover:text-green-800 font-medium"
                  >
                    Try again
                  </button>
                </div>
              )}
              {tensionStatus.kind === 'not_ready' && (
                <p className="text-sm text-stone-400 italic">Waiting on this team to finish this check-in cycle.</p>
              )}
              {tensionStatus.kind === 'ready' && (
                <TensionBreakdown
                  componentScores={tensionStatus.data.componentScores}
                  flaggedComponents={tensionStatus.data.flaggedComponents}
                  perComponentNotes={tensionStatus.data.perComponentNotes}
                />
              )}
            </>
          )}
        </div>

        {/* AI summary */}
        {selectedCycle !== null && tensionStatus.kind === 'ready' && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-stone-800">Instructor summary</h2>
              {!summary && (
                <button
                  onClick={handleGenerateSummary}
                  disabled={generatingSummary}
                  className="px-3 py-1.5 bg-green-700 text-white rounded-lg text-xs font-medium hover:bg-green-800 disabled:opacity-50 transition"
                >
                  {generatingSummary ? 'Generating…' : 'Generate summary'}
                </button>
              )}
            </div>
            {summary ? (
              <>
                <p className="text-sm text-stone-700 leading-relaxed mb-4">{summary.summary}</p>
                {summary.watch_points.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Watch points</p>
                    <ul className="space-y-1.5">
                      {summary.watch_points.map((w, i) => (
                        <li key={i} className="text-sm text-stone-700 flex gap-2">
                          <span className="text-amber-600">•</span>{w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : summaryError ? (
              <p className="text-sm text-red-600">{summaryError}</p>
            ) : (
              <p className="text-sm text-stone-400 italic">
                {generatingSummary ? 'Writing a summary of this cycle…' : 'No summary generated yet for this cycle.'}
              </p>
            )}
          </div>
        )}

        {/* Health over time */}
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
          <h2 className="text-lg font-bold text-stone-800 mb-4">Plant health over time</h2>
          <HealthTimeline events={health.events} />
        </div>
      </div>
    </main>
  )
}
