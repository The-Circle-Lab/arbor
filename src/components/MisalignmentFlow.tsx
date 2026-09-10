'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ChatComponent } from '@/lib/chat-components'
import { WaitingRoom } from '@/components/WaitingRoom'

type MisalignmentStage = 'own_pending' | 'waiting_for_team' | 'ready_to_synthesize' | 'drafting' | 'manual' | 'resolved'

interface MisalignmentResolution {
  round: number
  rejectCount: number
  manualMode: boolean
  draftText: string | null
  approveCount: number
  myVote: 'approve' | 'reject' | null
}

interface MisalignmentData {
  stage: MisalignmentStage
  teamSize: number
  actedCount: number
  mySubmissionStatus: 'submitted' | 'skipped' | null
  anonymizedAnswers: string[] | null
  resolution: MisalignmentResolution | null
}

function isMisalignmentData(value: unknown): value is MisalignmentData {
  return typeof value === 'object' && value !== null && 'stage' in value
}

interface MisalignmentFlowProps {
  teamId: string
  component: ChatComponent
  memberId: string
  isProjectManager: boolean
  teamSize: number
  cycleNumber?: number
}

// Polls GET /api/misalignment/[code]?component=&cycle= on the same 4s
// setInterval+fetch convention used throughout the app, and renders per
// `stage`. `code` comes from the route params rather than a prop — this
// component only ever renders nested under a [code] segment (agree/page.tsx,
// checkin-agree/[cycle]/page.tsx).
//
// Callers must pass a `key` that changes with `component`/`cycleNumber`
// (e.g. key={component}) so switching tabs remounts this component instead
// of needing an effect to reset local draft state — local state naturally
// starts fresh on every mount.
export function MisalignmentFlow({ component, memberId, isProjectManager, cycleNumber = 0 }: MisalignmentFlowProps) {
  const { code } = useParams<{ code: string }>()
  const [data, setData] = useState<MisalignmentData | null>(null)
  const [submissionText, setSubmissionText] = useState('')
  const [manualText, setManualText] = useState('')
  const [manualDirty, setManualDirty] = useState(false)
  const [busy, setBusy] = useState(false)

  const pollUrl = `/api/misalignment/${code.toUpperCase()}?component=${component}&cycle=${cycleNumber}`

  const refetch = useCallback(async () => {
    const res = await fetch(pollUrl)
    if (!res.ok) return
    const json = await res.json()
    if (!isMisalignmentData(json)) return
    setData(json)
    setManualText(current => {
      if (manualDirty) return current
      return json.resolution?.draftText ?? ''
    })
  }, [pollUrl, manualDirty])

  useEffect(() => {
    refetch()
    const interval = setInterval(refetch, 4000)
    return () => clearInterval(interval)
  }, [refetch])

  async function handleSubmit() {
    if (!submissionText.trim() || busy) return
    setBusy(true)
    await fetch(`/api/misalignment/${code.toUpperCase()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, component, cycleNumber, action: 'submit', content: submissionText }),
    })
    await refetch()
    setBusy(false)
  }

  async function handleSkip() {
    if (busy) return
    setBusy(true)
    await fetch(`/api/misalignment/${code.toUpperCase()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, component, cycleNumber, action: 'skip' }),
    })
    await refetch()
    setBusy(false)
  }

  async function handleSynthesize() {
    if (busy) return
    setBusy(true)
    const res = await fetch(`/api/misalignment/${code.toUpperCase()}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, component, cycleNumber }),
    })
    const json = await res.json()
    if (res.ok && isMisalignmentData(json)) setData(json)
    setBusy(false)
  }

  async function handleVote(vote: 'approve' | 'reject') {
    if (busy) return
    setBusy(true)
    const res = await fetch(`/api/misalignment/${code.toUpperCase()}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, component, cycleNumber, vote }),
    })
    const json = await res.json()
    if (res.ok && isMisalignmentData(json)) setData(json)
    setBusy(false)
  }

  async function handleSaveManual() {
    if (!manualText.trim() || busy) return
    setBusy(true)
    const res = await fetch(`/api/misalignment/${code.toUpperCase()}/manual`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, component, cycleNumber, text: manualText }),
    })
    const json = await res.json()
    if (res.ok && isMisalignmentData(json)) {
      setData(json)
      setManualDirty(false)
    }
    setBusy(false)
  }

  if (!data) {
    return <div className="py-6 text-center text-sm text-stone-400">Loading…</div>
  }

  if (data.mySubmissionStatus === 'skipped') {
    return (
      <div className="bg-stone-50 rounded-xl px-4 py-3 text-sm text-stone-500">
        You skipped this — no action needed.
      </div>
    )
  }

  if (data.stage === 'own_pending') {
    return (
      <div className="mb-4">
        <label className="block text-sm font-medium text-stone-700 mb-1">
          What should the group do about this disagreement?
        </label>
        <textarea
          className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm text-stone-800 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
          rows={3}
          value={submissionText}
          onChange={e => setSubmissionText(e.target.value)}
          placeholder="What do you think the team should agree to here?"
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleSubmit}
            disabled={busy || !submissionText.trim()}
            className="flex-1 bg-green-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-40 transition"
          >
            {busy ? 'Submitting…' : 'Submit'}
          </button>
          <button
            onClick={handleSkip}
            disabled={busy}
            className="px-4 border border-stone-200 text-stone-500 rounded-lg py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-40 transition"
          >
            Skip
          </button>
        </div>
      </div>
    )
  }

  if (data.stage === 'waiting_for_team') {
    return (
      <WaitingRoom
        pollUrl={pollUrl}
        readyCheck={raw => isMisalignmentData(raw) && raw.stage !== 'waiting_for_team'}
        onReady={refetch}
        message="Waiting for your team"
        subMessage="Once everyone's submitted or skipped, you'll see your teammates' answers."
      />
    )
  }

  if (data.stage === 'ready_to_synthesize') {
    const answers = data.anonymizedAnswers ?? []
    return (
      <div className="mb-4">
        <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-2">Anonymized answers</p>
        <div className="flex flex-col gap-2 mb-3">
          {answers.length === 0 ? (
            <p className="text-sm text-stone-400 italic">Everyone skipped this one.</p>
          ) : (
            answers.map((answer, i) => (
              <div key={i} className="bg-stone-50 rounded-xl p-3 text-sm text-stone-700">{answer}</div>
            ))
          )}
        </div>
        {isProjectManager ? (
          <button
            onClick={handleSynthesize}
            disabled={busy}
            className="w-full border border-green-600 text-green-700 rounded-lg py-2 text-sm font-medium hover:bg-green-50 disabled:opacity-40 transition"
          >
            {busy ? 'Generating…' : 'Generate synthesis draft'}
          </button>
        ) : (
          <p className="text-sm text-stone-400 text-center py-2">Waiting for your project manager to generate a synthesis draft.</p>
        )}
      </div>
    )
  }

  if (data.stage === 'drafting' && data.resolution) {
    const { resolution } = data
    const rejectionsLeft = 2 - resolution.rejectCount
    return (
      <div className="mb-4">
        <label className="block text-sm font-medium text-stone-700 mb-1">Proposed clause</label>
        <p className="w-full border border-stone-100 bg-stone-50 rounded-lg px-3 py-2 text-sm text-stone-800 whitespace-pre-wrap mb-2">
          {resolution.draftText}
        </p>
        {resolution.rejectCount >= 1 && (
          <p className="text-xs text-stone-400 mb-2">
            {`Attempt ${resolution.round} of up to 3 — ${rejectionsLeft} rejection${rejectionsLeft === 1 ? '' : 's'} left before the team writes it manually.`}
          </p>
        )}
        {resolution.myVote ? (
          <div className="text-sm text-green-700 font-medium py-2">
            {resolution.myVote === 'approve' ? '✓ You approved this' : 'You rejected this — waiting on a new draft'}
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => handleVote('approve')}
              disabled={busy}
              className="flex-1 bg-green-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-40 transition"
            >
              Approve
            </button>
            <button
              onClick={() => handleVote('reject')}
              disabled={busy}
              className="flex-1 border border-stone-200 text-stone-500 rounded-lg py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-40 transition"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    )
  }

  if (data.stage === 'manual' && data.resolution) {
    const { resolution } = data
    const hasDraft = resolution.draftText !== null && resolution.draftText.trim().length > 0
    return (
      <div className="mb-4">
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Write the clause together
          <span className="text-stone-400 font-normal ml-1">: the team writes this one manually.</span>
        </label>
        {isProjectManager ? (
          <>
            <textarea
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
              rows={3}
              value={manualText}
              onChange={e => { setManualText(e.target.value); setManualDirty(true) }}
            />
            <button
              onClick={handleSaveManual}
              disabled={busy || !manualText.trim()}
              className="mt-2 w-full border border-green-600 text-green-700 rounded-lg py-2 text-sm font-medium hover:bg-green-50 disabled:opacity-40 transition"
            >
              {busy ? 'Saving…' : 'Save clause'}
            </button>
          </>
        ) : (
          <p className="w-full border border-stone-100 bg-stone-50 rounded-lg px-3 py-2 text-sm text-stone-800 whitespace-pre-wrap">
            {resolution.draftText || 'Waiting for your project manager to write this.'}
          </p>
        )}
        {hasDraft && (
          resolution.myVote ? (
            <div className="text-sm text-green-700 font-medium py-2 mt-2">✓ You approved this</div>
          ) : (
            <button
              onClick={() => handleVote('approve')}
              disabled={busy}
              className="mt-2 w-full bg-green-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-40 transition"
            >
              Approve
            </button>
          )
        )}
      </div>
    )
  }

  return (
    <div className="text-center text-green-700 font-medium text-sm py-2">✓ Resolved</div>
  )
}
