'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, getMembership } from '@/lib/session'
import { ArbourLogo } from '@/components/ArbourLogo'

interface Member {
  id: string
  display_name: string
  pronouns?: string | null
}

export default function LobbyPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const { loading, user, memberships } = useSession()
  const membership = getMembership(memberships, code)

  const [teamName, setTeamName] = useState('')
  const [teamId, setTeamId] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [copied, setCopied] = useState(false)
  const [projectTitle, setProjectTitle] = useState('')
  const [deadline, setDeadline] = useState('')
  const [brief, setBrief] = useState('')
  const [briefSaved, setBriefSaved] = useState(false)
  const [briefSaving, setBriefSaving] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user || !membership) { router.replace('/'); return }
    const poll = async () => {
      const res = await fetch(`/api/teams/${code.toUpperCase()}`)
      if (!res.ok) return
      const data = await res.json()
      setTeamName(data.name)
      setTeamId(data.id)
      setMembers(data.members)
      if (data.project_title) setProjectTitle(data.project_title)
      if (data.deadline) setDeadline(data.deadline.slice(0, 10))
      if (data.assignment_brief) setBrief(data.assignment_brief)
    }
    poll()
    const interval = setInterval(poll, 4000)
    return () => clearInterval(interval)
  }, [code, loading, user, membership, router])

  function copyCode() {
    navigator.clipboard.writeText(code.toUpperCase())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleStart() {
    router.push(`/${code}/choose-project-manager`)
  }

  async function handleSaveBrief() {
    if (!teamId) return
    setBriefSaving(true)
    await fetch('/api/teams', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId,
        projectTitle: projectTitle.trim() || undefined,
        deadline: deadline || undefined,
        assignmentBrief: brief.trim() || undefined,
      }),
    })
    setBriefSaving(false)
    setBriefSaved(true)
    setTimeout(() => setBriefSaved(false), 2000)
  }

  const isCreator = members[0]?.id === membership?.member_id

  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <ArbourLogo size={48} />
          </div>
          <h1 className="text-2xl font-bold text-stone-800">{teamName}</h1>
          <p className="text-stone-500 text-sm mt-1">Team lobby</p>
        </div>

        {/* Join code */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-5">
          <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-2">Team code: share this</p>
          <div className="flex items-center gap-3">
            <span className="text-3xl font-mono font-bold tracking-widest text-green-700 flex-1">
              {code.toUpperCase()}
            </span>
            <button
              onClick={copyCode}
              className="text-sm px-3 py-1.5 border border-stone-200 rounded-lg text-stone-600 hover:bg-stone-50 transition"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-stone-400 mt-3">
            Your teammates go to <span className="font-medium">arbour-906763384892.northamerica-northeast2.run.app</span> → Join a team → enter this code
          </p>
        </div>

        {/* What's about to happen */}
        <div className="bg-green-50 rounded-2xl border border-green-100 p-5 mb-5">
          <p className="text-xs text-green-700 uppercase tracking-wide font-semibold mb-3">What happens next</p>
          <ol className="text-sm text-green-900 space-y-2">
            <li className="flex gap-2"><span className="font-bold">1.</span> Each of you reflects individually on 6 areas of your collaboration, privately, on your own screen.</li>
            <li className="flex gap-2"><span className="font-bold">2.</span> Your answers are revealed side-by-side, and Arbour highlights where you align or diverge.</li>
            <li className="flex gap-2"><span className="font-bold">3.</span> You discuss and write a group agreement for each area. Everyone approves it.</li>
            <li className="flex gap-2"><span className="font-bold">4.</span> Two check-in cycles surface tension as it builds, visualised as a plant.</li>
          </ol>
        </div>

        {/* Members */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-5">
          <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-3">
            Who's here ({members.length})
          </p>
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
            {members.length < 2 && (
              <p className="text-xs text-stone-400 italic mt-1">Waiting for teammates to join…</p>
            )}
          </div>
        </div>

        {/* Project context — creator only */}
        {isCreator ? (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-5">
            <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-1">Project details (optional)</p>
            <p className="text-xs text-stone-400 mb-3">As team creator, you input the project details. Your teammates will see what you enter once saved.</p>
            <div className="flex flex-col gap-3">
              <input
                className="border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Project title"
                value={projectTitle}
                onChange={e => setProjectTitle(e.target.value)}
              />
              <div>
                <label className="block text-xs text-stone-500 mb-1">Deadline</label>
                <input
                  type="date"
                  className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                />
              </div>
              <textarea
                className="border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
                rows={3}
                placeholder="Paste assignment brief or rubric here…"
                value={brief}
                onChange={e => setBrief(e.target.value)}
              />
              <button
                onClick={handleSaveBrief}
                disabled={briefSaving}
                className="text-sm text-green-700 border border-green-600 rounded-lg py-2 hover:bg-green-50 transition disabled:opacity-40"
              >
                {briefSaved ? '✓ Saved' : briefSaving ? 'Saving…' : 'Save project details'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-stone-50 border border-stone-100 rounded-xl px-4 py-3 mb-5 text-sm text-stone-500">
            The team creator is entering the project details and deadline.
          </div>
        )}

        {/* Co-presence note */}
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-4 text-sm text-amber-800">
          <span className="font-semibold">Best in the same room or on a call.</span> Individual reflection can be done separately, but everything from the reveal onward needs live discussion.
        </div>

        <button
          onClick={handleStart}
          disabled={members.length < 2}
          className="w-full bg-green-700 text-white rounded-xl py-4 text-lg font-medium hover:bg-green-800 disabled:opacity-40 transition"
        >
          {members.length < 2 ? 'Waiting for teammates…' : 'Choose your project manager →'}
        </button>
        {members.length >= 2 && (
          <p className="text-xs text-stone-400 text-center mt-2">Each person taps this on their own device</p>
        )}
      </div>
    </main>
  )
}
