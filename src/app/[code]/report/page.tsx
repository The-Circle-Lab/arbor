'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, getMembership } from '@/lib/session'
import { ChatComponent } from '@/lib/chat-components'
import { type PlantType } from '@/components/PlantVisual'
import { PlantHealthTimeline, type PlantHealthEntry } from '@/components/PlantHealthTimeline'

interface AgreementEntry {
  component: ChatComponent
  finalText: string | null
}

interface DecisionTimelineEntry {
  type: 'agreement_reached' | 'tension_resolved'
  at: string
  component?: ChatComponent
  label: string
  detail: string
}

interface AiReport {
  summary: string
  highlights: string[]
  growth_areas: string[]
  graded_on: string | null
  generated_at: string
}

interface ReportData {
  team: { name: string; projectTitle: string | null; plantType: string | null; grade: string | null }
  agreements: AgreementEntry[]
  plantHealthHistory: PlantHealthEntry[]
  decisionTimeline: DecisionTimelineEntry[]
  aiReport: AiReport | null
  aiReportStale: boolean
}

const TIMELINE_STYLES: Record<DecisionTimelineEntry['type'], string> = {
  agreement_reached: 'bg-green-50 border-green-100 text-green-900',
  tension_resolved: 'bg-amber-50 border-amber-100 text-amber-900',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function FinalReportPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const { loading: sessionLoading, user, memberships } = useSession()
  const membership = getMembership(memberships, code)

  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingAI, setLoadingAI] = useState(false)
  const [aiTimedOut, setAiTimedOut] = useState(false)

  // Guards the polling loop below against setting state after the user has
  // navigated away — otherwise a slow poll left running in the background
  // keeps calling setData/setLoadingAI on an unmounted page.
  const unmountedRef = useRef(false)
  useEffect(() => () => { unmountedRef.current = true }, [])

  const pollForAI = useCallback(async (teamCode: string) => {
    setLoadingAI(true)
    setAiTimedOut(false)
    fetch(`/api/final-report/${teamCode.toUpperCase()}`, { method: 'POST' }).catch(() => {})

    let found: AiReport | null = null
    for (let attempt = 0; attempt < 40 && !unmountedRef.current; attempt++) {
      const res = await fetch(`/api/final-report/${teamCode.toUpperCase()}`)
      if (unmountedRef.current) return
      if (res.ok) {
        const d: ReportData = await res.json()
        setData(d)
        if (d.aiReport && !d.aiReportStale) { found = d.aiReport; break }
      }
      await new Promise(r => setTimeout(r, 3000))
    }
    if (unmountedRef.current) return
    if (!found) setAiTimedOut(true)
    setLoadingAI(false)
  }, [])

  useEffect(() => {
    if (sessionLoading) return
    if (!user || !membership) { router.replace('/'); return }

    async function load() {
      const res = await fetch(`/api/final-report/${code.toUpperCase()}`)
      if (!res.ok) { setLoading(false); return }
      const d: ReportData = await res.json()
      if (unmountedRef.current) return
      setData(d)
      setLoading(false)
      if (!d.aiReport || d.aiReportStale) await pollForAI(code)
    }
    load()
  }, [sessionLoading, user, membership, code, router, pollForAI])

  if (loading || !data) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-400 text-sm">Loading…</p>
      </main>
    )
  }

  const plantType = (data.team.plantType as PlantType) ?? 'default'

  return (
    <main className="min-h-screen bg-stone-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <button onClick={() => router.back()} className="text-xs text-stone-400 hover:text-stone-600 mb-4 block">
            ← Back
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-stone-800">{data.team.name}: Final Report</h1>
            {data.team.grade !== null && (
              <span className="rounded-full border border-green-200 bg-green-50 text-green-800 text-xs font-semibold px-3 py-1">
                Final grade: {data.team.grade}
              </span>
            )}
          </div>
          <p className="text-stone-500 text-sm mt-1">
            {`${data.team.projectTitle ?? 'Your project'} — how the team collaborated and delivered.`}
          </p>
        </div>

        {/* AI summary */}
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mb-8">
          <h2 className="text-lg font-bold text-stone-800 mb-3">Summary</h2>
          {data.aiReport ? (
            <>
              <p className="text-sm text-stone-700 leading-relaxed mb-5">{data.aiReport.summary}</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">What went well</p>
                  <ul className="space-y-1.5">
                    {data.aiReport.highlights.map((h, i) => (
                      <li key={i} className="text-sm text-stone-700 flex gap-2">
                        <span className="text-green-600">•</span>{h}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Worth watching next time</p>
                  <ul className="space-y-1.5">
                    {data.aiReport.growth_areas.map((g, i) => (
                      <li key={i} className="text-sm text-stone-700 flex gap-2">
                        <span className="text-amber-600">•</span>{g}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {data.aiReportStale && (
                <div className="bg-green-50 rounded-xl p-3 mt-5 text-xs text-green-700 animate-pulse">Updating your summary…</div>
              )}
            </>
          ) : loadingAI ? (
            <div className="bg-green-50 rounded-xl p-4 text-sm text-green-700 animate-pulse">Writing your team&apos;s summary…</div>
          ) : aiTimedOut ? (
            <div className="bg-amber-50 rounded-xl p-4 text-sm text-amber-800 flex items-center justify-between">
              <span>This is taking longer than expected.</span>
              <button
                onClick={() => pollForAI(code as string)}
                className="ml-4 px-3 py-1.5 bg-amber-700 text-white rounded-lg text-xs font-medium hover:bg-amber-800 transition"
              >
                Retry
              </button>
            </div>
          ) : null}
        </div>

        {/* Plant health timeline */}
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mb-8">
          <h2 className="text-lg font-bold text-stone-800 mb-4">Plant health over time</h2>
          <PlantHealthTimeline history={data.plantHealthHistory} plantType={plantType} />
        </div>

        {/* Team agreement timeline */}
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
          <h2 className="text-lg font-bold text-stone-800 mb-4">Where the team agreed and disagreed</h2>
          {data.decisionTimeline.length === 0 ? (
            <p className="text-sm text-stone-400 italic">No recorded decisions yet.</p>
          ) : (
            <div className="space-y-3">
              {data.decisionTimeline.map((entry, i) => (
                <div key={i} className={`rounded-xl p-4 border ${TIMELINE_STYLES[entry.type]}`}>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <p className="text-sm font-semibold">{entry.label}</p>
                    <span className="text-xs opacity-60 shrink-0">{formatDate(entry.at)}</span>
                  </div>
                  <p className="text-sm opacity-90">{entry.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
