'use client'

// Shares the selected-course state between CourseSwitcher (the course
// switcher, rendered in the global navbar) and the instructor pages that
// need to know which course's teams to fetch — kept in client component
// state (this context), not the URL, per the instructor-dashboard plan's
// judgment call.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode, Dispatch, SetStateAction } from 'react'
import { useSession, isInstructorUser } from '@/lib/session'

export interface InstructorCourse {
  id: string
  name: string
  join_code: string
  created_at: string
  team_count: number
}

interface InstructorCourseContextValue {
  courses: InstructorCourse[]
  loading: boolean
  error: string
  selectedCourseId: string | null
  setSelectedCourseId: Dispatch<SetStateAction<string | null>>
  refreshCourses: () => Promise<void>
}

const InstructorCourseContext = createContext<InstructorCourseContextValue | null>(null)

export function InstructorCourseProvider({ children }: { children: ReactNode }) {
  const { user, loading: sessionLoading } = useSession()
  const isInstructor = isInstructorUser(user)
  const [courses, setCourses] = useState<InstructorCourse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)

  const refreshCourses = useCallback(async () => {
    // Session hasn't resolved yet — isInstructor is unknown, not confirmed
    // false, so don't drop `loading` to false with a stale/empty list.
    if (sessionLoading) return
    if (!isInstructor) { setCourses([]); setLoading(false); setError(''); return }
    // A real fetch is about to start: make sure `loading` reflects that even
    // if a previous (not-an-instructor) pass already set it to false, so
    // consumers never see loading=false with a stale, pre-fetch courses list.
    setLoading(true)
    try {
      const res = await fetch('/api/courses')
      // A failed fetch must not be mistaken for "this instructor has zero
      // courses" — leave the existing courses list alone and surface the
      // failure instead, so the dashboard doesn't offer to create a
      // duplicate course on top of ones that already exist.
      if (!res.ok) { setError('Could not load your courses.'); return }
      const data: { courses: InstructorCourse[] } = await res.json()
      setCourses(data.courses)
      setError('')
      // Falls back to the first remaining course if the previously-selected one
      // is gone (e.g. just deleted), rather than leaving selectedCourseId
      // pointing at a course that no longer appears in the list.
      setSelectedCourseId(current =>
        current && data.courses.some(c => c.id === current) ? current : (data.courses[0]?.id ?? null)
      )
    } catch {
      setError('Could not load your courses.')
    } finally {
      setLoading(false)
    }
  }, [isInstructor, sessionLoading])

  useEffect(() => {
    refreshCourses()
  }, [refreshCourses])

  const value = useMemo(
    () => ({ courses, loading, error, selectedCourseId, setSelectedCourseId, refreshCourses }),
    [courses, loading, error, selectedCourseId, refreshCourses]
  )

  return (
    <InstructorCourseContext.Provider value={value}>
      {children}
    </InstructorCourseContext.Provider>
  )
}

export function useInstructorCourses(): InstructorCourseContextValue {
  const ctx = useContext(InstructorCourseContext)
  if (!ctx) throw new Error('useInstructorCourses must be used within InstructorCourseProvider')
  return ctx
}
