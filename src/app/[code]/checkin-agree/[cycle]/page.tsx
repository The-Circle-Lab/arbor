'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, getMembership } from '@/lib/session'
import { COMPONENT_LABELS, COMPONENT_DESCRIPTIONS, ChatComponent } from '@/lib/chat-components'
import { WaitingRoom } from '@/components/WaitingRoom'
import { DiscussionTimer, DiscussionTimerState } from '@/components/DiscussionTimer'
import { MisalignmentFlow } from '@/components/MisalignmentFlow'
import { EngagementLevel, FacilitationOrderEntry } from '@/lib/subject-scoring'

interface Agreement {
  component: string
  final_text: string | null
  recorded_by: string | null
}

interface Approval {
  component: string
  member_id: string
}

export default function CheckinAgreePage() {
  const { code, cycle } = useParams<{ code: string; cycle: string }>()
  const router = useRouter()
  const cycleNum = parseInt(cycle)
  const { loading, user, memberships } = useSession()
  const membership = getMembership(memberships, code)

  const [teamId, setTeamId] = useState('')
  const [teamSize, setTeamSize] = useState(2)
  const [projectManagerId, setProjectManagerId] = useState<string | null>(null)
  const [engagementLevel, setEngagementLevel] = useState<EngagementLevel>('low')
  const [facilitationOrder, setFacilitationOrder] = useState<FacilitationOrderEntry[]>([])
  const [members, setMembers] = useState<{ id: string; display_name: string }[]>([])
  const [flagged, setFlagged] = useState<ChatComponent[]>([])
  const [comments, setComments] = useState<Record<string, string>>({})
  const [splitReasons, setSplitReasons] = useState<Record<string, string>>({})
  const [agreements, setAgreements] = useState<Record<string, Agreement>>({})
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [active, setActive] = useState<ChatComponent | null>(null)
  const [note, setNote] = useState('')
  const [revising, setRevising] = useState(false)
  const [ready, setReady] = useState(false)
  const [timer, setTimer] = useState<DiscussionTimerState | null>(null)
  const [timerLoaded, setTimerLoaded] = useState(false)

  const activeRef = useRef<ChatComponent | null>(null)

  async function loadAll() {
    const teamRes = await fetch(`/api/teams/${code.toUpperCase()}`)
    if (!teamRes.ok) return
    const teamData = await teamRes.json()
    setTeamId(teamData.id)
    setTeamSize(teamData.status.teamSize)
    setMembers(teamData.members)
    setProjectManagerId(teamData.project_manager_id ?? null)
    setEngagementLevel(teamData.engagement_level ?? 'low')
    setFacilitationOrder(teamData.facilitation_order ?? [])

    const plantRes = await fetch(`/api/plant/${code.toUpperCase()}/${cycleNum}`)
    if (!plantRes.ok) return
    const plant = await plantRes.json()
    const flaggedList: ChatComponent[] = plant.flagged_components ?? []
    setFlagged(flaggedList)
    setComments(plant.per_component ?? {})
    setSplitReasons(plant.split_reasons ?? {})
    if (!activeRef.current && flaggedList.length > 0) {
      activeRef.current = flaggedList[0]
      setActive(flaggedList[0])
    }

    const agRes = await fetch(`/api/agreements?teamId=${teamData.id}`)
    if (agRes.ok) {
      const agData = await agRes.json()
      const map: Record<string, Agreement> = {}
      for (const ag of agData.agreements) map[ag.component] = ag
      setAgreements(map)
      setApprovals(agData.approvals)

      // Same poll as the rest of this page's state, so the timer and
      // allResolved (computed below from flagged/approvals) always reflect
      // one consistent snapshot instead of two independently-timed polls.
      const resolved = flaggedList.length > 0 && flaggedList.every((comp: ChatComponent) =>
        agData.approvals.filter((a: Approval) => a.component === comp).length >= teamData.status.teamSize
      )
      // A cycle with nothing flagged never reaches the DiscussionTimer render
      // path at all (see the early return below) — don't poll for it either.
      if (flaggedList.length > 0 && !resolved) {
        const params = new URLSearchParams({ step: 'CHECKIN_AGREE', cycle: String(cycleNum) })
        const timerRes = await fetch(`/api/teams/${code.toUpperCase()}/discussion-timer?${params.toString()}`)
        if (timerRes.ok) setTimer(await timerRes.json())
      }
      setTimerLoaded(true)
    }
    setReady(true)
  }

  async function handleStartTimer() {
    await fetch(`/api/teams/${code.toUpperCase()}/discussion-timer/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'CHECKIN_AGREE', cycleNumber: cycleNum }),
    })
    await loadAll()
  }

  async function handleExtendTimer() {
    await fetch(`/api/teams/${code.toUpperCase()}/discussion-timer/extend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'CHECKIN_AGREE', cycleNumber: cycleNum }),
    })
    await loadAll()
  }

  useEffect(() => {
    if (loading) return
    if (!user || !membership) { router.replace('/'); return }
    loadAll()
    const interval = setInterval(loadAll, 4000)
    return () => clearInterval(interval)
  }, [code, loading, user, membership, cycleNum])

  if (loading || !user || !membership) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <WaitingRoom message="Loading" subMessage="Just a moment" />
      </main>
    )
  }

  function approvalsFor(comp: string) {
    return approvals.filter(a => a.component === comp)
  }
  function fullyApproved(comp: string) {
    return approvalsFor(comp).length >= teamSize
  }
  const allResolved = flagged.length > 0 && flagged.every(c => fullyApproved(c))
  const isProjectManager = !!projectManagerId && projectManagerId === membership?.member_id
  const projectManagerName = members.find(m => m.id === projectManagerId)?.display_name ?? 'your project manager'

  async function handleRevise() {
    if (!teamId || !active || !note.trim()) return
    setRevising(true)
    await fetch('/api/checkin-agreements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, component: active, cycleNumber: cycleNum, resolutionNote: note, memberId: membership!.member_id }),
    })
    await loadAll()
    setRevising(false)
  }

  async function handleApprove() {
    if (!teamId || !active) return
    await fetch('/api/agreements/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, component: active, memberId: membership!.member_id }),
    })
    await loadAll()
  }

  async function handleWithdraw() {
    if (!teamId || !active) return
    await fetch('/api/agreements/approve', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, component: active, memberId: membership!.member_id }),
    })
    await loadAll()
  }

  function selectComponent(comp: ChatComponent) {
    activeRef.current = comp
    setActive(comp)
    setNote('')
  }

  // Walks forward through the flagged tabs, wrapping around, to the next one
  // that isn't fully re-approved yet — lets "Next" step through everything
  // left to re-agree on rather than requiring manual tab clicks.
  function nextUnresolvedComponent(from: ChatComponent | null): ChatComponent | null {
    if (flagged.length === 0) return null
    const idx = from ? flagged.indexOf(from) : -1
    for (let i = 1; i <= flagged.length; i++) {
      const candidate = flagged[(idx + i) % flagged.length]
      if (!fullyApproved(candidate)) return candidate
    }
    return null
  }

  function handleNext() {
    const next = nextUnresolvedComponent(active)
    if (next) selectComponent(next)
  }

  function handleContinue() {
    if (cycleNum >= 2) router.push(`/${code}/start`)
    else router.push(`/${code}/checkin-intro`)
  }

  if (!ready) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <WaitingRoom message="Loading your check-in" subMessage="Gathering what shifted since you agreed…" />
      </main>
    )
  }

  if (flagged.length === 0) {
    return (
      <main className="min-h-screen bg-green-700 flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="text-white text-lg font-semibold mb-4">Nothing flagged this cycle — you&apos;re still aligned.</p>
          <button onClick={handleContinue} className="bg-white text-green-800 rounded-xl py-3 px-6 text-sm font-semibold hover:bg-green-50 transition">
            Continue →
          </button>
        </div>
      </main>
    )
  }

  const ag = active ? agreements[active] : null
  const myApproval = active ? approvalsFor(active).some(a => a.member_id === membership?.member_id) : false

  return (
    <main className="min-h-screen bg-stone-50">
      {!allResolved && engagementLevel !== 'high' && (
        <DiscussionTimer
          loading={!timerLoaded}
          timer={timer}
          isProjectManager={isProjectManager}
          onStart={handleStartTimer}
          onExtend={handleExtendTimer}
        />
      )}
      <div className="max-w-3xl mx-auto p-4 md:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-stone-800">Re-align after check-in</h1>
          <p className="text-stone-500 text-sm mt-1">
            {`Cycle ${cycleNum} · ${flagged.filter(c => fullyApproved(c)).length} of ${flagged.length} re-agreed · talk each one through, then approve the updated agreement.`}
          </p>
        </div>

        {/* Flagged component tabs */}
        <div className="flex gap-2 flex-wrap mb-6">
          {flagged.map(comp => (
            <button
              key={comp}
              onClick={() => selectComponent(comp)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                active === comp
                  ? 'bg-green-700 text-white border-green-700'
                  : fullyApproved(comp)
                    ? 'bg-green-100 text-green-700 border-green-200'
                    : 'bg-amber-100 text-amber-700 border-amber-200'
              }`}
            >
              {fullyApproved(comp) ? '✓ ' : '⚠ '}{COMPONENT_LABELS[comp]}
            </button>
          ))}
        </div>

        {active && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mb-4">
            <div className="mb-2">
              <h2 className="text-lg font-bold text-stone-800">{COMPONENT_LABELS[active]}</h2>
              <p className="text-xs text-stone-400 mt-0.5">{COMPONENT_DESCRIPTIONS[active]}</p>
            </div>

            {/* AI gap comment */}
            {comments[active] && (
              <div className="rounded-xl p-4 mb-4 text-sm bg-amber-50 text-amber-900">
                <p className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-1">What shifted</p>
                <p>{comments[active]}</p>
              </div>
            )}

            {engagementLevel === 'medium' && active && (
              <div className="mt-3 text-xs text-amber-900 border-t border-amber-200 pt-3">
                <p>{splitReasons[active]
                  ? `Your group's check-in showed movement on this, because ${splitReasons[active]}. Before anyone responds to what someone else said, every member needs to state their own position first, in this order — no replying, no jumping in early:`
                  : `Your group's check-in showed movement on this. Before anyone responds to what someone else said, every member needs to state their own position first, in this order — no replying, no jumping in early:`}</p>
                <ol className="list-decimal list-inside my-2">
                  {facilitationOrder.map(entry => <li key={entry.memberId}>{entry.displayName}</li>)}
                </ol>
                <p>Once everyone above has gone, you can start responding to each other. This step is needed because the group&apos;s check-in showed drift, and hearing everyone&apos;s opinion again is important for making it visible.</p>
              </div>
            )}

            {/* Current agreement */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-stone-700 mb-1">Current agreement</label>
              <p className="w-full border border-stone-100 bg-stone-50 rounded-lg px-3 py-2 text-sm text-stone-800 whitespace-pre-wrap">
                {ag?.final_text ?? '—'}
              </p>
            </div>

            {/* HIGH-engagement teams get the async 3-stage MisalignmentFlow instead of the resolutionNote UI. */}
            {!fullyApproved(active) && engagementLevel === 'high' && (
              <div className="mb-4">
                <MisalignmentFlow
                  key={`${active}-${cycleNum}`}
                  teamId={teamId}
                  component={active}
                  memberId={membership.member_id}
                  isProjectManager={isProjectManager}
                  teamSize={teamSize}
                  cycleNumber={cycleNum}
                />
              </div>
            )}

            {/* Revise the agreement, or approve as-is if it still holds — project manager only */}
            {!fullyApproved(active) && engagementLevel !== 'high' && (
              isProjectManager ? (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    What did the team decide?
                    <span className="text-stone-400 font-normal ml-1">: update the agreement, or approve as-is if it still holds</span>
                  </label>
                  <textarea
                    className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm text-stone-800 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                    rows={2}
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="e.g. We're behind on the data work, so Alan takes testing and Annie picks up the remaining analysis."
                  />
                  <button
                    onClick={handleRevise}
                    disabled={revising || !note.trim()}
                    className="mt-2 w-full border border-green-600 text-green-700 rounded-lg py-2 text-sm font-medium hover:bg-green-50 disabled:opacity-40 transition"
                  >
                    {revising ? 'Updating agreement…' : 'Update agreement with this'}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-stone-400 mb-4">
                  {`${projectManagerName} records what the team decides and updates the wording. Read it over and approve when it looks right.`}
                </p>
              )
            )}

            {/* Approval */}
            <div className="border-t border-stone-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-stone-600">
                  Approvals: {approvalsFor(active).length} / {teamSize}
                </span>
                <div className="flex gap-2">
                  {members.map(m => (
                    <span
                      key={m.id}
                      className={`text-xs px-2 py-1 rounded-full ${
                        approvalsFor(active!).some(a => a.member_id === m.id)
                          ? 'bg-green-100 text-green-700'
                          : 'bg-stone-100 text-stone-400'
                      }`}
                    >
                      {m.display_name}
                    </span>
                  ))}
                </div>
              </div>

              {fullyApproved(active) ? (
                <div className="text-center text-green-700 font-medium text-sm py-2">✓ Re-agreed</div>
              ) : myApproval ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-sm text-green-700 font-medium">✓ You approved this</div>
                  <button onClick={handleWithdraw} className="text-xs text-stone-400 hover:text-stone-600 hover:underline">
                    Withdraw
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleApprove}
                  className="w-full bg-green-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-green-800 transition"
                >
                  Approve this agreement
                </button>
              )}
            </div>
          </div>
        )}

        {allResolved ? (
          <button
            onClick={handleContinue}
            className="w-full bg-green-700 text-white rounded-xl py-4 text-lg font-medium hover:bg-green-800 transition"
          >
            {cycleNum >= 2 ? 'Finish — back to work →' : 'Done — continue →'}
          </button>
        ) : active && fullyApproved(active) ? (
          <button
            onClick={handleNext}
            className="w-full bg-green-700 text-white rounded-xl py-4 text-lg font-medium hover:bg-green-800 transition"
          >
            Next unresolved section →
          </button>
        ) : (
          <div className="text-center text-sm text-stone-400 py-2">
            {`${flagged.filter(c => !fullyApproved(c)).length} still need to be re-agreed`}
          </div>
        )}
      </div>
    </main>
  )
}
