'use client'

// Independent copy of src/lib/instructor-context.tsx — shares the selected-
// course state between ResearcherCourseSwitcher (rendered in the global
// navbar) and the researcher pages that need to know which course's teams
// to fetch. Kept separate per the researcher-role plan's design decision:
// the researcher dashboard is expected to diverge from the instructor one
// over time, so sharing this context now would mean untangling it later.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode, Dispatch, SetStateAction } from 'react'
import { useSession, isResearcherUser } from '@/lib/session'

export interface ResearcherCourse {
  id: string
  name: string
  join_code: string
  created_at: string
  team_count: number
}

interface ResearcherCourseContextValue {
  courses: ResearcherCourse[]
  loading: boolean
  error: string
  selectedCourseId: string | null
  setSelectedCourseId: Dispatch<SetStateAction<string | null>>
  refreshCourses: () => Promise<void>
}

const ResearcherCourseContext = createContext<ResearcherCourseContextValue | null>(null)

export function ResearcherCourseProvider({ children }: { children: ReactNode }) {
  const { user, loading: sessionLoading } = useSession()
  const isResearcher = isResearcherUser(user)
  const [courses, setCourses] = useState<ResearcherCourse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)

  const refreshCourses = useCallback(async () => {
    // Session hasn't resolved yet — isResearcher is unknown, not confirmed
    // false, so don't drop `loading` to false with a stale/empty list.
    if (sessionLoading) return
    if (!isResearcher) { setCourses([]); setLoading(false); setError(''); return }
    // A real fetch is about to start: make sure `loading` reflects that even
    // if a previous (not-a-researcher) pass already set it to false, so
    // consumers never see loading=false with a stale, pre-fetch courses list.
    setLoading(true)
    try {
      const res = await fetch('/api/researcher/courses')
      // A failed fetch must not be mistaken for "there are zero courses" —
      // leave the existing courses list alone and surface the failure
      // instead.
      if (!res.ok) { setError('Could not load courses.'); return }
      const data: { courses: ResearcherCourse[] } = await res.json()
      setCourses(data.courses)
      setError('')
      // Falls back to the first remaining course if the previously-selected one
      // is gone, rather than leaving selectedCourseId pointing at a course
      // that no longer appears in the list.
      setSelectedCourseId(current =>
        current && data.courses.some(c => c.id === current) ? current : (data.courses[0]?.id ?? null)
      )
    } catch {
      setError('Could not load courses.')
    } finally {
      setLoading(false)
    }
  }, [isResearcher, sessionLoading])

  useEffect(() => {
    refreshCourses()
  }, [refreshCourses])

  const value = useMemo(
    () => ({ courses, loading, error, selectedCourseId, setSelectedCourseId, refreshCourses }),
    [courses, loading, error, selectedCourseId, refreshCourses]
  )

  return (
    <ResearcherCourseContext.Provider value={value}>
      {children}
    </ResearcherCourseContext.Provider>
  )
}

export function useResearcherCourses(): ResearcherCourseContextValue {
  const ctx = useContext(ResearcherCourseContext)
  if (!ctx) throw new Error('useResearcherCourses must be used within ResearcherCourseProvider')
  return ctx
}
