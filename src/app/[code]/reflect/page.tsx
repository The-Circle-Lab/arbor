'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, getMembership } from '@/lib/session'
import {
  COMPONENT_LABELS,
  COMPONENT_DESCRIPTIONS,
  REFLECTION_QUESTIONS,
  SUBJECT_LABEL,
  SUBJECT_DESCRIPTION,
  SUBJECT_QUESTIONS,
  ChatComponent,
} from '@/lib/chat-components'
import { WaitingRoom } from '@/components/WaitingRoom'
import { ArbourLogo } from '@/components/ArbourLogo'

// Subject is no longer a shared CHAT component, but the reflect wizard keeps
// asking its 3 questions in the same spot (2nd, right after Objective) — it's
// just sourced from SUBJECT_QUESTIONS and stored separately (subjectResponses)
// instead of alongside the 5 real ChatComponents.
type ReflectStep = 'subject' | ChatComponent

const STEPS: ReflectStep[] = ['object', 'subject', 'division_of_labor', 'rules', 'tools', 'community']

type ResponseBag = Record<string, string | string[] | Record<string, string>>
type Responses = Record<ChatComponent, ResponseBag>

function getQuestionsForStep(step: ReflectStep) {
  return step === 'subject' ? SUBJECT_QUESTIONS : REFLECTION_QUESTIONS[step]
}

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function shuffleWithOtherLast(options: string[]): string[] {
  const rest = options.filter(o => o !== 'Other')
  const hasOther = rest.length !== options.length
  const shuffled = shuffleArray(rest)
  return hasOther ? [...shuffled, 'Other'] : shuffled
}

function getDisplayOptions(map: Map<string, string[]>, step: ReflectStep, q: { id: string; options?: string[] }): string[] {
  return map.get(`${step}-${q.id}`) ?? q.options ?? []
}

export default function ReflectPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const { loading, user, memberships } = useSession()
  const membership = getMembership(memberships, code)

  const [responses, setResponses] = useState<Partial<Responses>>({})
  const [subjectResponses, setSubjectResponses] = useState<ResponseBag>({})
  const [currentIdx, setCurrentIdx] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user || !membership) { router.replace('/'); return }
  }, [loading, user, membership, router])

  const shuffledOptionsMap = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const step of STEPS) {
      for (const q of getQuestionsForStep(step)) {
        if (q.shuffleOptions && q.options) {
          map.set(`${step}-${q.id}`, shuffleWithOtherLast(q.options))
        }
      }
    }
    return map
  }, [])

  if (loading || !user || !membership) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <WaitingRoom message="Loading" subMessage="Just a moment" />
      </main>
    )
  }

  const currentStep = STEPS[currentIdx]
  const questions = getQuestionsForStep(currentStep)
  const isLast = currentIdx === STEPS.length - 1

  function getCompResponses(step: ReflectStep): ResponseBag {
    return step === 'subject' ? subjectResponses : (responses[step] ?? {})
  }

  function setValue(step: ReflectStep, key: string, value: string | string[] | Record<string, string>) {
    if (step === 'subject') {
      setSubjectResponses(prev => ({ ...prev, [key]: value }))
      return
    }
    setResponses(prev => ({
      ...prev,
      [step]: { ...(prev[step] ?? {}), [key]: value },
    }))
  }

  function toggleMultiselect(step: ReflectStep, key: string, option: string) {
    const bag = getCompResponses(step)
    const value = bag[key]
    const current = Array.isArray(value) ? value : []
    const next = current.includes(option) ? current.filter(o => o !== option) : [...current, option]
    setValue(step, key, next)
  }

  function canAdvance() {
    const compResponses = getCompResponses(currentStep)
    return questions.every(q => {
      const value = compResponses[q.id]
      if (q.type === 'multiselect') return Array.isArray(value) && value.length > 0
      if (q.type === 'choice') return typeof value === 'string' && value.length > 0
      if (q.type === 'priority-rank') {
        const sel: Record<string, string> = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
        return (q.options ?? []).every(opt => !!sel[opt])
      }
      return typeof value === 'string' && value.trim().length > 0
    })
  }

  function setPriorityLevel(questionId: string, option: string, level: string) {
    const bag = getCompResponses(currentStep)
    const raw = bag[questionId]
    const current: Record<string, string> = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    setValue(currentStep, questionId, { ...current, [option]: level })
  }

  async function handleSubmit() {
    if (!membership) return
    setSubmitting(true)
    setSubmitError(false)
    try {
      const res = await fetch('/api/reflections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: membership.member_id, responses, subjectResponses }),
      })
      if (!res.ok) {
        setSubmitError(true)
        return
      }
      setSubmitted(true)
    } catch {
      setSubmitError(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <WaitingRoom
          message="Waiting for your teammates"
          subMessage="You'll be taken to the reveal once everyone has submitted."
          pollUrl={`/api/reflections/${code.toUpperCase()}`}
          readyCheck={(d: unknown) => (d as { ready: boolean }).ready}
          onReady={() => router.push(`/${code}/reveal`)}
        />
      </main>
    )
  }

  const compResponses = getCompResponses(currentStep)
  const stepLabel = currentStep === 'subject' ? SUBJECT_LABEL : COMPONENT_LABELS[currentStep]
  const stepDescription = currentStep === 'subject' ? SUBJECT_DESCRIPTION : COMPONENT_DESCRIPTIONS[currentStep]

  return (
    <main className="min-h-screen bg-stone-50 p-6 flex flex-col items-center">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <ArbourLogo size={28} />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-stone-400 font-medium uppercase tracking-wide">
                {`${currentIdx + 1} of ${STEPS.length} · Individual reflection`}
              </span>
            </div>
            <div className="w-full bg-stone-200 rounded-full h-1.5">
              <div
                className="bg-green-600 h-1.5 rounded-full transition-all"
                style={{ width: `${((currentIdx + 1) / STEPS.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
          <h2 className="text-xl font-bold text-stone-800 mb-0.5">{stepLabel}</h2>
          <p className="text-xs text-stone-400 mb-5">{stepDescription}</p>

          <div className="flex flex-col gap-6">
            {questions.map(q => (
              <div key={q.id}>
                <label className="block text-sm font-medium text-stone-700 mb-2">{q.question}</label>

                {q.type === 'text' && (
                  <textarea
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
                    rows={3}
                    value={(compResponses[q.id] as string) ?? ''}
                    onChange={e => setValue(currentStep, q.id, e.target.value)}
                    placeholder="Your answer…"
                  />
                )}

                {q.type === 'choice' && q.options && (
                  <div className="flex flex-col gap-2">
                    {getDisplayOptions(shuffledOptionsMap, currentStep, q).map(opt => {
                      const selected = compResponses[q.id] === opt
                      return (
                        <label key={opt} className={`flex items-center gap-3 cursor-pointer border rounded-lg px-3 py-2.5 transition ${selected ? 'border-green-500 bg-green-50' : 'border-stone-200 hover:bg-stone-50'}`}>
                          <input
                            type="radio"
                            name={`${currentStep}-${q.id}`}
                            checked={selected}
                            onChange={() => setValue(currentStep, q.id, opt)}
                            className="accent-green-600"
                          />
                          <span className="text-sm text-stone-700">{opt}</span>
                        </label>
                      )
                    })}
                    {compResponses[q.id] === 'Other' && (
                      <input
                        className="border border-stone-200 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-1 focus:ring-green-500"
                        placeholder="Please specify…"
                        value={(compResponses[`${q.id}_other`] as string) ?? ''}
                        onChange={e => setValue(currentStep, `${q.id}_other`, e.target.value)}
                      />
                    )}
                    {q.withOpenText && (
                      <textarea
                        className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 resize-none focus:outline-none focus:ring-2 focus:ring-green-500 mt-1"
                        rows={2}
                        value={(compResponses[`${q.id}_open`] as string) ?? ''}
                        onChange={e => setValue(currentStep, `${q.id}_open`, e.target.value)}
                        placeholder="Anything to add in your own words…"
                      />
                    )}
                  </div>
                )}

                {q.type === 'multiselect' && q.options && (
                  <div className="flex flex-col gap-2">
                    {getDisplayOptions(shuffledOptionsMap, currentStep, q).map(opt => {
                      const selected = ((compResponses[q.id] as string[]) ?? []).includes(opt)
                      return (
                        <label key={opt} className={`flex items-center gap-3 cursor-pointer border rounded-lg px-3 py-2.5 transition ${selected ? 'border-green-500 bg-green-50' : 'border-stone-200 hover:bg-stone-50'}`}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleMultiselect(currentStep, q.id, opt)}
                            className="accent-green-600"
                          />
                          <span className="text-sm text-stone-700">{opt}</span>
                          {opt === 'Other' && selected && (
                            <input
                              className="border border-stone-200 rounded px-2 py-1 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-green-500"
                              placeholder="Specify…"
                              value={(compResponses[`${q.id}_other`] as string) ?? ''}
                              onChange={e => setValue(currentStep, `${q.id}_other`, e.target.value)}
                            />
                          )}
                        </label>
                      )
                    })}
                    {q.withOpenText && (
                      <textarea
                        className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 resize-none focus:outline-none focus:ring-2 focus:ring-green-500 mt-1"
                        rows={2}
                        value={(compResponses[`${q.id}_open`] as string) ?? ''}
                        onChange={e => setValue(currentStep, `${q.id}_open`, e.target.value)}
                        placeholder="Anything to add in your own words…"
                      />
                    )}
                  </div>
                )}

                {q.type === 'priority-rank' && q.options && (
                  <div className="flex flex-col gap-2">
                    {getDisplayOptions(shuffledOptionsMap, currentStep, q).map(opt => {
                      const sel = (compResponses[q.id] as Record<string, string>) ?? {}
                      const current = sel[opt]
                      return (
                        <div key={opt} className="flex items-center gap-3 border border-stone-200 rounded-lg px-3 py-2.5">
                          <span className="text-sm text-stone-700 flex-1">{opt}</span>
                          <div className="flex gap-1">
                            {(['High', 'Medium', 'Low'] as const).map(level => (
                              <button
                                key={level}
                                type="button"
                                onClick={() => setPriorityLevel(q.id, opt, level)}
                                className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition ${
                                  current === level
                                    ? level === 'High'
                                      ? 'bg-green-600 text-white border-green-600'
                                      : level === 'Medium'
                                      ? 'bg-amber-400 text-white border-amber-400'
                                      : 'bg-stone-400 text-white border-stone-400'
                                    : 'bg-white text-stone-400 border-stone-200 hover:bg-stone-50'
                                }`}
                              >
                                {level}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {submitError && (
            <p className="text-sm text-red-600 mt-4">
              Something went wrong submitting your reflection. Please try again.
            </p>
          )}

          <div className="flex justify-between mt-6 gap-3">
            {currentIdx > 0 && (
              <button
                onClick={() => { setCurrentIdx(i => i - 1); setSubmitError(false) }}
                className="px-4 py-2 text-sm text-stone-500 border border-stone-200 rounded-lg hover:bg-stone-50"
              >
                Back
              </button>
            )}
            <div className="flex-1" />
            {currentStep === 'subject' && (
              <button
                onClick={() => { setSubjectResponses({}); setCurrentIdx(i => i + 1); setSubmitError(false) }}
                className="px-4 py-2 text-sm text-stone-500 border border-stone-200 rounded-lg hover:bg-stone-50"
              >
                Skip
              </button>
            )}
            {!isLast ? (
              <button
                onClick={() => { setCurrentIdx(i => i + 1); setSubmitError(false) }}
                disabled={!canAdvance()}
                className="px-5 py-2 bg-green-700 text-white text-sm rounded-lg hover:bg-green-800 disabled:opacity-40 transition"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canAdvance() || submitting}
                className="px-5 py-2 bg-green-700 text-white text-sm rounded-lg hover:bg-green-800 disabled:opacity-40 transition"
              >
                {submitting ? 'Submitting…' : 'Submit reflection'}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
