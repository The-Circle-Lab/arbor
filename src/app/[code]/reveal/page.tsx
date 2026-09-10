'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, getMembership } from '@/lib/session'
import { CHAT_COMPONENTS, COMPONENT_LABELS, COMPONENT_DESCRIPTIONS, ChatComponent } from '@/lib/chat-components'
import { DiscussionTimerStartModal } from '@/components/DiscussionTimerStartModal'
import { EngagementLevel, FacilitationOrderEntry } from '@/lib/subject-scoring'

const NEGOTIATION_NUDGES: Record<ChatComponent, string> = {
  object:            'This difference is worth talking about: what does success actually mean to each of you, in practice?',
  division_of_labor: 'This difference is worth talking about: who owns what, and does that match what you\'re each expecting to carry?',
  rules:             'This difference is worth talking about: what does it actually feel like to work well together, and do you mean the same thing?',
  tools:             'This difference is worth talking about: can you land on a specific list of tools you\'ll both actually use?',
  community:         'This difference is worth talking about: who gets a say in how you work, and is that expectation shared?',
}

interface Reflection {
  member_id: string
  display_name: string
  component: string
  response_data: Record<string, unknown>
}

interface RevealAI {
  per_component: Record<ChatComponent, string>
  flagged_components: string[]
  split_reasons: Partial<Record<ChatComponent, string>> | null
}

export default function RevealPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()

  const { loading, user, memberships } = useSession()
  const membership = getMembership(memberships, code)
  const [reflections, setReflections] = useState<Reflection[]>([])
  const [members, setMembers] = useState<string[]>([])
  const [teamId, setTeamId] = useState('')
  const [aiResult, setAiResult] = useState<RevealAI | null>(null)
  const [loadingAI, setLoadingAI] = useState(false)
  const [activeComponent, setActiveComponent] = useState<ChatComponent>('object')
  const [waitingForTeam, setWaitingForTeam] = useState(true)
  const [projectManagerId, setProjectManagerId] = useState<string | null>(null)
  const [engagementLevel, setEngagementLevel] = useState<EngagementLevel>('low')
  const [facilitationOrder, setFacilitationOrder] = useState<FacilitationOrderEntry[]>([])
  // MEDIUM only: true once the team has stepped through every CHAT component
  // one at a time via the per-component Continue/"All of us stated our
  // positions" button below — only then does the real discussion-timer start
  // modal appear.
  const [walkthroughDone, setWalkthroughDone] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user || !membership) { router.replace('/'); return }

    async function load() {
      let refData = null
      for (let attempt = 0; attempt < 60; attempt++) {
        const refRes = await fetch(`/api/reflections/${code.toUpperCase()}`)
        if (refRes.ok) { refData = await refRes.json(); break }
        await new Promise(r => setTimeout(r, 4000))
      }
      if (!refData) return
      setWaitingForTeam(false)
      setReflections(refData.reflections)

      const unique = Array.from(new Set<string>(refData.reflections.map((r: Reflection) => r.display_name)))
      setMembers(unique)

      const teamRes = await fetch(`/api/teams/${code.toUpperCase()}`)
      const teamData = await teamRes.json()
      setTeamId(teamData.id)
      setProjectManagerId(teamData.project_manager_id ?? null)
      setEngagementLevel(teamData.engagement_level ?? 'low')
      setFacilitationOrder(teamData.facilitation_order ?? [])

      // Trigger AI generation (idempotent — returns cached if already done)
      fetch(`/api/reveal-ai/${code.toUpperCase()}`, { method: 'POST' }).catch(() => {})
      // Poll GET until result is cached
      await pollForAI(code)
    }

    load()
  }, [loading, user, membership, code, router])

  const [aiTimedOut, setAiTimedOut] = useState(false)

  async function pollForAI(teamCode: string) {
    setLoadingAI(true)
    setAiTimedOut(false)
    let aiData = null
    for (let attempt = 0; attempt < 40; attempt++) {
      const aiRes = await fetch(`/api/reveal-ai/${teamCode.toUpperCase()}`)
      if (aiRes.ok) { aiData = await aiRes.json(); break }
      await new Promise(r => setTimeout(r, 3000))
    }
    if (aiData) {
      setAiResult(aiData)
    } else {
      setAiTimedOut(true)
    }
    setLoadingAI(false)
  }

  const flagged = aiResult?.flagged_components ?? []
  const isProjectManager = !!projectManagerId && projectManagerId === membership?.member_id

  // HIGH-engagement teams skip the reveal comparison entirely — the AI
  // analysis still has to run here (this is what inserts the reveal_ai row
  // the /agree page and DB stage transition depend on), but once it's ready
  // we forward straight into /agree instead of showing the side-by-side
  // answers and per-component summary.
  useEffect(() => {
    if (engagementLevel === 'high' && aiResult) router.replace(`/${code}/agree`)
  }, [engagementLevel, aiResult, code, router])

  // Once there's something to discuss, wait for the discussion timer to
  // start (the project manager's own start click navigates immediately —
  // this poll is what carries everyone else across once it does) and move
  // the whole team into the Agree page together.
  useEffect(() => {
    // HIGH skips this entirely — it's redirected to /agree as soon as
    // aiResult is ready, before there's ever a discussion timer to wait on.
    if (!aiResult || flagged.length === 0 || engagementLevel === 'high') return
    let cancelled = false

    async function poll() {
      const res = await fetch(`/api/teams/${code.toUpperCase()}/discussion-timer?step=AGREEING`)
      if (cancelled || !res.ok) return
      const timer = await res.json()
      if (timer) router.push(`/${code}/agree`)
    }

    poll()
    const interval = setInterval(poll, 3000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [aiResult, flagged.length, engagementLevel, code, router])

  // MEDIUM only: steps the walkthrough to the next CHAT component, or marks
  // it done once the last component's button is clicked (which reveals the
  // real discussion-timer start modal below).
  function handleComponentAdvance() {
    const idx = CHAT_COMPONENTS.indexOf(activeComponent)
    if (idx < CHAT_COMPONENTS.length - 1) {
      setActiveComponent(CHAT_COMPONENTS[idx + 1])
    } else {
      setWalkthroughDone(true)
    }
  }

  async function handleStartTimer() {
    await fetch(`/api/teams/${code.toUpperCase()}/discussion-timer/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'AGREEING', cycleNumber: null }),
    })
    router.push(`/${code}/agree`)
  }

  function getResponsesForComponent(component: ChatComponent) {
    return reflections.filter(r => r.component === component)
  }

  function formatResponse(data: Record<string, unknown>): string {
    return Object.entries(data)
      .filter(([k]) => !k.endsWith('_other') && !k.endsWith('_open'))
      .map(([, v]) => {
        if (Array.isArray(v)) return v.join(', ')
        if (v && typeof v === 'object') {
          return Object.entries(v as Record<string, string>)
            .map(([opt, level]) => `${opt}: ${level}`)
            .join(', ')
        }
        return v as string
      })
      .filter(Boolean)
      .join('\n')
  }

  if (waitingForTeam) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-stone-700 font-medium mb-1">Waiting for everyone to finish reflecting</p>
          <p className="text-stone-400 text-sm">You'll see the comparison once all responses are in.</p>
        </div>
      </main>
    )
  }

  if (engagementLevel === 'high') {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          {aiTimedOut && !aiResult ? (
            <>
              <p className="text-stone-700 font-medium mb-1">Analysis is taking longer than expected</p>
              <button
                onClick={() => pollForAI(code as string)}
                className="mt-3 px-4 py-2 bg-amber-700 text-white rounded-lg text-sm font-medium hover:bg-amber-800 transition"
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <p className="text-stone-700 font-medium mb-1">Analyzing your team&apos;s alignment</p>
              <p className="text-stone-400 text-sm">You&apos;ll move straight to your group agreements.</p>
            </>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-stone-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-stone-800">Reveal</h1>
          <p className="text-stone-500 text-sm mt-1">
            See how your answers compare, before writing any agreement.
          </p>
        </div>

        {/* Component tabs */}
        <div className="flex gap-2 flex-wrap mb-6">
          {CHAT_COMPONENTS.map(comp => (
            <button
              key={comp}
              onClick={() => setActiveComponent(comp)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                activeComponent === comp
                  ? 'bg-green-700 text-white'
                  : flagged.includes(comp)
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
              }`}
            >
              {flagged.includes(comp) && '⚠ '}{COMPONENT_LABELS[comp]}
            </button>
          ))}
        </div>

        {/* Active component panel */}
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mb-4">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-stone-800">{COMPONENT_LABELS[activeComponent]}</h2>
              <p className="text-xs text-stone-400 mt-0.5">{COMPONENT_DESCRIPTIONS[activeComponent]}</p>
            </div>
            {flagged.includes(activeComponent) && (
              <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                Flagged: needs resolution
              </span>
            )}
          </div>

          {/* Member answers side by side */}
          <div
            className="grid gap-4 mb-5"
            style={{ gridTemplateColumns: `repeat(${Math.max(members.length, 1)}, minmax(0, 1fr))` }}
          >
            {members.map(name => {
              const ref = getResponsesForComponent(activeComponent).find(r => r.display_name === name)
              return (
                <div key={name} className="bg-stone-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">{name}</p>
                  <p className="text-sm text-stone-700 whitespace-pre-line">
                    {ref ? formatResponse(ref.response_data) : <span className="text-stone-300 italic">No response</span>}
                  </p>
                </div>
              )
            })}
          </div>

          {/* AI comment */}
          {loadingAI && (
            <div className="bg-green-50 rounded-xl p-4 text-sm text-green-700 animate-pulse">
              Analyzing alignment…
            </div>
          )}
          {aiTimedOut && !aiResult && (
            <div className="bg-amber-50 rounded-xl p-4 text-sm text-amber-800 flex items-center justify-between">
              <span>Analysis is taking longer than expected.</span>
              <button
                onClick={() => pollForAI(code as string)}
                className="ml-4 px-3 py-1.5 bg-amber-700 text-white rounded-lg text-xs font-medium hover:bg-amber-800 transition"
              >
                Retry
              </button>
            </div>
          )}
          {aiResult && (
            <div className={`rounded-xl p-4 text-sm ${flagged.includes(activeComponent) ? 'bg-amber-50 text-amber-900' : 'bg-green-50 text-green-900'}`}>
              <p className="font-semibold mb-1 text-xs uppercase tracking-wide opacity-60">
                {flagged.includes(activeComponent) ? 'Alignment gap' : 'Arbour summary'}
              </p>
              {flagged.includes(activeComponent) && engagementLevel === 'medium' ? (
                <>
                  <p>{aiResult.split_reasons?.[activeComponent]
                    ? `Your group's answers were split on this, because ${aiResult.split_reasons[activeComponent]}. Before anyone responds to what someone else said, every member needs to state their own position first, in this order — no replying, no jumping in early:`
                    : `Your group's answers were split on this. Before anyone responds to what someone else said, every member needs to state their own position first, in this order — no replying, no jumping in early:`}</p>
                  <ol className="list-decimal list-inside my-2">
                    {facilitationOrder.map(entry => <li key={entry.memberId}>{entry.displayName}</li>)}
                  </ol>
                  <p>Once everyone above has gone, you can start responding to each other. This step is needed because the group was split, and hearing everyone&apos;s opinion is important for making the split visible.</p>
                </>
              ) : (
                <>
                  <p>{aiResult.per_component[activeComponent]}</p>
                  {flagged.includes(activeComponent) && (
                    <p className="mt-3 text-xs italic opacity-75 border-t border-amber-200 pt-3">
                      {NEGOTIATION_NUDGES[activeComponent]}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* MEDIUM only: step through every component one at a time before the
              real discussion timer appears below. */}
          {aiResult && engagementLevel === 'medium' && flagged.length > 0 && !walkthroughDone && (
            <button
              onClick={handleComponentAdvance}
              className={`w-full rounded-xl py-3 mt-4 font-semibold transition ${
                flagged.includes(activeComponent)
                  ? 'bg-amber-600 text-white hover:bg-amber-700'
                  : 'bg-green-700 text-white hover:bg-green-800'
              }`}
            >
              {flagged.includes(activeComponent) ? 'All of us stated our positions' : 'Continue'}
            </button>
          )}
        </div>

        {/* Summary + proceed */}
        {aiResult && flagged.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
            <h3 className="font-semibold text-stone-800 mb-2">Before you continue</h3>
            <p className="text-sm text-stone-600 mb-4">No major gaps detected. When you're ready, move on to write your group agreements.</p>
            <button
              onClick={() => router.push(`/${code}/agree`)}
              className="w-full bg-green-700 text-white rounded-xl py-3 font-medium hover:bg-green-800 transition"
            >
              Continue →
            </button>
          </div>
        )}

        {aiResult && flagged.length > 0 && engagementLevel === 'medium' && walkthroughDone && (
          <DiscussionTimerStartModal isProjectManager={isProjectManager} onStart={handleStartTimer} />
        )}

        {aiResult && flagged.length > 0 && engagementLevel === 'low' && (
          <DiscussionTimerStartModal isProjectManager={isProjectManager} onStart={handleStartTimer} />
        )}
      </div>
    </main>
  )
}
