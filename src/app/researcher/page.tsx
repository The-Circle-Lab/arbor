'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useResearcherCourses } from '@/lib/researcher-context'
import { PlantVisual, STATE_LABELS, STATE_COLORS, isPlantType, type PlantState } from '@/components/PlantVisual'
import { STAGE_LABELS } from '@/lib/team-stage'
import type { CourseTeamCounters } from '@/lib/course-team-counters'

interface CourseTeam {
  id: string
  name: string
  joinCode: string
  deadline: string | null
  plantType: string | null
  stage: number
  state: PlantState
}

// Read-only copy of src/app/instructor/page.tsx — same course → team
// plant-health grid, scoped to every course in the system (via
// useResearcherCourses) instead of just courses the user owns/was added to,
// and with no create/edit/delete surface: no "+ New course" welcome flow,
// just a plain empty state when no courses exist.
export default function ResearcherDashboardPage() {
  const router = useRouter()
  const { courses, loading: coursesLoading, error: coursesError, selectedCourseId, refreshCourses } = useResearcherCourses()
  const [teams, setTeams] = useState<CourseTeam[] | null>(null)
  const [counters, setCounters] = useState<CourseTeamCounters | null>(null)
  const [loadingTeams, setLoadingTeams] = useState(false)
  const [teamsError, setTeamsError] = useState('')
  const [copied, setCopied] = useState(false)

  const selectedCourse = courses.find(c => c.id === selectedCourseId) ?? null

  async function copyJoinCode() {
    if (!selectedCourse) return
    try {
      await navigator.clipboard.writeText(selectedCourse.join_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access denied/unavailable — leave the button reading "Copy".
    }
  }

  useEffect(() => {
    setTeams(null)
    setCounters(null)
    setTeamsError('')
    if (!selectedCourseId) return
    let ignore = false
    setLoadingTeams(true)
    const poll = async () => {
      try {
        const res = await fetch(`/api/researcher/courses/${selectedCourseId}/teams`)
        if (!res.ok) throw new Error('Request failed')
        const data = await res.json()
        if (!ignore) { setTeams(data.teams); setCounters(data.counters); setTeamsError('') }
      } catch {
        if (!ignore) setTeamsError('Could not load teams.')
      } finally {
        if (!ignore) setLoadingTeams(false)
      }
    }
    poll()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') poll()
    }, 4000)
    return () => { ignore = true; clearInterval(interval) }
  }, [selectedCourseId])

  if (coursesLoading) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-400 text-sm">Loading…</p>
      </main>
    )
  }

  if (coursesError && courses.length === 0) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-stone-500 text-sm mb-3">{coursesError}</p>
          <button onClick={() => refreshCourses()} className="text-xs text-green-700 hover:text-green-800 font-medium">
            Try again
          </button>
        </div>
      </main>
    )
  }

  const showEmpty = courses.length === 0
  const needsAttention = (teams ?? []).filter(t => t.state === 'wilting' || t.state === 'dead')

  if (showEmpty) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-400 text-sm italic">No courses exist yet.</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-stone-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-stone-800">{selectedCourse?.name || 'All groups'}</h1>
          <p className="text-stone-500 text-sm mt-1">Plant health across every team in this course.</p>
        </div>

        {selectedCourse && (
          <div className="inline-flex items-center gap-2.5 bg-white rounded-xl shadow-sm border border-stone-100 px-3 py-2 mb-6">
            <p className="text-[10px] text-stone-400 uppercase tracking-wide font-medium">Course code</p>
            <span className="text-sm font-mono font-bold tracking-widest text-green-700">{selectedCourse.join_code}</span>
            <button
              onClick={copyJoinCode}
              className="text-xs px-2 py-1 border border-stone-200 rounded-md text-stone-600 hover:bg-stone-50 transition"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}

        {selectedCourse && counters !== null && (
          <div className="flex flex-wrap gap-3 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-stone-100 px-3 py-2">
              <p className="text-[10px] text-stone-400 uppercase tracking-wide font-medium">Teams</p>
              <p className="text-sm font-bold text-stone-800">{counters.teamCount}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-stone-100 px-3 py-2">
              <p className="text-[10px] text-stone-400 uppercase tracking-wide font-medium">Members</p>
              <p className="text-sm font-bold text-stone-800">{counters.memberCount}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-stone-100 px-3 py-2">
              <p className="text-[10px] text-stone-400 uppercase tracking-wide font-medium">Reflections complete</p>
              <p className="text-sm font-bold text-stone-800">{counters.reflectionsCompleteCount} / {counters.teamCount}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-stone-100 px-3 py-2">
              <p className="text-[10px] text-stone-400 uppercase tracking-wide font-medium">Agreements complete</p>
              <p className="text-sm font-bold text-stone-800">{counters.agreementsCompleteCount} / {counters.teamCount}</p>
            </div>
          </div>
        )}

        {needsAttention.length > 0 && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-6 text-sm text-amber-800">
            <span className="font-semibold">{needsAttention.length} team{needsAttention.length === 1 ? '' : 's'} need attention:</span>{' '}
            {needsAttention.map(t => t.name).join(', ')}
          </div>
        )}

        {loadingTeams || teams === null ? (
          teamsError ? (
            <p className="text-red-600 text-sm">{teamsError}</p>
          ) : (
            <p className="text-stone-400 text-sm">Loading teams…</p>
          )
        ) : teams.length === 0 ? (
          <p className="text-stone-400 text-sm italic">No teams have joined this course yet.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {teams.map(team => (
              <button
                key={team.id}
                onClick={() => router.push(`/researcher/teams/${team.id}`)}
                className="w-36 flex flex-col items-center text-center gap-1 bg-white rounded-2xl shadow-sm border border-stone-100 p-3 hover:border-green-600 transition"
              >
                <PlantVisual
                  state={team.state}
                  plantType={isPlantType(team.plantType) ? team.plantType : 'default'}
                  size={64}
                  hideLabel
                />
                <h2 className="text-sm font-semibold text-stone-800 mt-1 line-clamp-1">{team.name}</h2>
                <span className={`text-xs font-medium px-2 py-1 rounded-full border ${STATE_COLORS[team.state].bg} ${STATE_COLORS[team.state].text} ${STATE_COLORS[team.state].border}`}>
                  {STATE_LABELS[team.state]}
                </span>
                <p className="text-xs text-stone-400 mt-0.5 line-clamp-1">{STAGE_LABELS[team.stage] ?? `Stage ${team.stage}`}</p>
                <span className="text-xs text-stone-400 font-mono">{team.joinCode}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
