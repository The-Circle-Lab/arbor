'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArbourLogo } from '@/components/ArbourLogo'
import { WaitingRoom } from '@/components/WaitingRoom'
import { useSession, isInstructorUser, isResearcherUser } from '@/lib/session'

export default function LandingPage() {
  const router = useRouter()
  const { loading, user, memberships, refresh } = useSession()
  const [mode, setMode] = useState<'home' | 'create' | 'join'>('home')
  const [teamName, setTeamName] = useState('')
  const [courseCode, setCourseCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading || submitting) return
    if (!user) { router.replace('/login'); return }
    if (isInstructorUser(user)) { router.replace('/instructor'); return }
    if (isResearcherUser(user)) { router.replace('/researcher'); return }
    if (memberships.length === 1) router.replace(`/${memberships[0].join_code}`)
  }, [loading, user, memberships, submitting, router])

  async function handleCreate() {
    if (!teamName.trim() || !courseCode.trim()) return setError('Please fill in all fields.')
    setSubmitting(true)
    setError('')
    try {
      const teamRes = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: teamName, courseJoinCode: courseCode.trim() || undefined }),
      })
      const team = await teamRes.json()
      if (!teamRes.ok) throw new Error(team.error)

      const joinRes = await fetch(`/api/teams/${team.join_code}/join`, { method: 'POST' })
      const member = await joinRes.json()
      if (!joinRes.ok) throw new Error(member.error)

      await refresh()
      router.push(`/${team.join_code}/lobby`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setSubmitting(false)
    }
  }

  async function handleJoin() {
    if (!joinCode.trim()) return setError('Please fill in all fields.')
    setSubmitting(true)
    setError('')
    try {
      const joinRes = await fetch(`/api/teams/${joinCode.toUpperCase()}/join`, { method: 'POST' })
      const member = await joinRes.json()
      if (!joinRes.ok) throw new Error(member.error)

      await refresh()
      router.push(`/${member.joinCode}/lobby`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setSubmitting(false)
    }
  }

  // Loading, not-yet-authenticated (Proxy redirects momentarily), an
  // instructor (auto-redirecting to /instructor), a researcher
  // (auto-redirecting to /researcher), or the single-team case
  // (auto-redirecting into that team) all show the same waiting state rather
  // than flashing the create/join UI underneath.
  if (loading || !user || isInstructorUser(user) || isResearcherUser(user) || memberships.length === 1) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <WaitingRoom message="Loading" subMessage="Just a moment" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">

        {memberships.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-6">
            <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-3">Your teams</p>
            <div className="flex flex-col gap-2">
              {memberships.map(m => (
                <button
                  key={m.member_id}
                  onClick={() => router.push(`/${m.join_code}`)}
                  className="flex items-center justify-between border border-stone-200 rounded-xl px-4 py-3 text-left hover:border-green-600 hover:bg-green-50 transition"
                >
                  <span className="text-stone-700 font-medium">{m.team_name}</span>
                  <span className="text-xs font-mono text-stone-400 tracking-widest">{m.join_code}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'home' && (
          <>
            {memberships.length === 0 && (
              <div className="text-center mb-10">
                <div className="flex justify-center mb-3">
                  <ArbourLogo size={56} />
                </div>
                <h1 className="text-4xl font-bold text-stone-800 mb-2">Arbour</h1>
                <p className="text-stone-500 text-sm mb-6">Team alignment, made visible.</p>

                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 text-left mb-8">
                  <p className="text-sm text-stone-600 leading-relaxed">
                    Arbour helps teams get aligned before they start working. You each reflect privately on six areas of your collaboration, compare answers side-by-side, and write a shared agreement. As work progresses, short check-ins surface tension early, visualised as a plant that reflects your team&apos;s health.
                  </p>
                  <p className="text-sm text-stone-600 leading-relaxed mt-3">
                    It&apos;s built on <span className="font-medium text-stone-800">Activity Theory</span>: a framework that maps collaboration across goals, roles, rules, tools, and community.
                  </p>
                </div>
              </div>
            )}

            {memberships.length > 0 && (
              <p className="text-center text-sm text-stone-500 mb-4">Or start something new:</p>
            )}

            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-1 text-sm text-amber-800">
              <span className="font-semibold">One person creates the team.</span> Share the code with your teammates and they join from this page.
            </div>

            <div className="flex flex-col gap-3 mt-4">
              <button
                onClick={() => setMode('create')}
                className="w-full bg-green-700 text-white rounded-xl py-4 text-lg font-medium hover:bg-green-800 transition"
              >
                Create a team
              </button>
              <button
                onClick={() => setMode('join')}
                className="w-full border-2 border-green-700 text-green-700 rounded-xl py-4 text-lg font-medium hover:bg-green-50 transition"
              >
                Join a team
              </button>
            </div>
          </>
        )}

        {mode === 'create' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-2">
              <ArbourLogo size={32} />
              <h2 className="text-xl font-semibold text-stone-700">Create a team</h2>
            </div>
            <input
              className="border border-stone-300 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-600"
              placeholder="Team name (e.g. CS446 Group 3)"
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
            />
            <input
              className="border border-stone-300 rounded-lg px-4 py-3 text-stone-800 tracking-widest focus:outline-none focus:ring-2 focus:ring-green-600"
              placeholder="Course code"
              value={courseCode}
              onChange={e => setCourseCode(e.target.value.toUpperCase())}
              maxLength={6}
              required
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              onClick={handleCreate}
              disabled={submitting}
              className="w-full bg-green-700 text-white rounded-xl py-3 font-medium hover:bg-green-800 disabled:opacity-50 transition"
            >
              {submitting ? 'Creating…' : 'Create team'}
            </button>
            <button onClick={() => { setMode('home'); setError('') }} className="text-stone-400 text-sm text-center hover:underline">
              Back
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-2">
              <ArbourLogo size={32} />
              <h2 className="text-xl font-semibold text-stone-700">Join a team</h2>
            </div>
            <input
              className="border border-stone-300 rounded-lg px-4 py-3 text-stone-800 uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-green-600"
              placeholder="Team code (e.g. AB3XYZ)"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              onClick={handleJoin}
              disabled={submitting}
              className="w-full bg-green-700 text-white rounded-xl py-3 font-medium hover:bg-green-800 disabled:opacity-50 transition"
            >
              {submitting ? 'Joining…' : 'Join team'}
            </button>
            <button onClick={() => { setMode('home'); setError('') }} className="text-stone-400 text-sm text-center hover:underline">
              Back
            </button>
          </div>
        )}

      </div>
    </main>
  )
}
