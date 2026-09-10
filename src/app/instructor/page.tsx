'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useInstructorCourses } from '@/lib/instructor-context'
import { PlantVisual, STATE_LABELS, STATE_COLORS, isPlantType, type PlantState } from '@/components/PlantVisual'
import { Modal } from '@/components/Modal'
import { STAGE_LABELS } from '@/lib/team-stage'
import { useCreateCourse, CreateCourseForm, CreateCourseSuccess } from '@/components/instructor/CreateCourseFlow'

interface CourseTeam {
  id: string
  name: string
  joinCode: string
  deadline: string | null
  plantType: string | null
  stage: number
  state: PlantState
}

export default function InstructorDashboardPage() {
  const router = useRouter()
  const { courses, loading: coursesLoading, error: coursesError, selectedCourseId, refreshCourses } = useInstructorCourses()
  const [teams, setTeams] = useState<CourseTeam[] | null>(null)
  const [loadingTeams, setLoadingTeams] = useState(false)
  const [teamsError, setTeamsError] = useState('')
  const { name: newCourseName, setName: setNewCourseName, creating, error, createdCode, submit: handleCreateCourse, reset: resetCreateCourse } = useCreateCourse({
    onCreated: () => refreshCourses(),
  })
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
    setTeamsError('')
    if (!selectedCourseId) return
    let ignore = false
    setLoadingTeams(true)
    const poll = async () => {
      try {
        const res = await fetch(`/api/courses/${selectedCourseId}/teams`)
        if (!res.ok) throw new Error('Request failed')
        const data = await res.json()
        if (!ignore) { setTeams(data.teams); setTeamsError('') }
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

  const showWelcome = courses.length === 0
  const needsAttention = (teams ?? []).filter(t => t.state === 'wilting' || t.state === 'dead')

  return (
    <>
    {showWelcome ? (
      <main className="min-h-screen bg-stone-50 p-4 md:p-8">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold text-stone-800 mb-2">Welcome</h1>
          <p className="text-stone-500 text-sm mb-6">Create your first course to start tracking your students&apos; teams.</p>
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
            <CreateCourseForm
              name={newCourseName}
              onNameChange={setNewCourseName}
              onSubmit={handleCreateCourse}
              creating={creating}
              error={error}
            />
          </div>
        </div>
      </main>
    ) : (
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
                onClick={() => router.push(`/instructor/teams/${team.id}`)}
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
    )}

    <Modal open={!!createdCode} labelledBy="course-created-title" onClose={resetCreateCourse}>
      <div className="p-6">
        <h2 id="course-created-title" className="text-lg font-bold text-stone-800 mb-4">Course created</h2>
        {createdCode && <CreateCourseSuccess joinCode={createdCode} onDone={resetCreateCourse} doneLabel="Got it" />}
      </div>
    </Modal>
    </>
  )
}
