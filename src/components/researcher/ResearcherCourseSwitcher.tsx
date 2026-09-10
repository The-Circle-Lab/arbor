'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession, isResearcherUser } from '@/lib/session'
import { useResearcherCourses } from '@/lib/researcher-context'

// Read-only copy of src/components/instructor/CourseSwitcher.tsx — course
// list + select-to-switch only. No "+ New course" button/modal, no ✕
// delete/leave, no ⚙ manage-instructors: a researcher can't create, delete,
// or manage a course's instructors.
export function ResearcherCourseSwitcher() {
  const { user } = useSession()
  const { courses, selectedCourseId, setSelectedCourseId } = useResearcherCourses()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && event.target instanceof Node && !containerRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (!user || !isResearcherUser(user)) return null

  const selectedCourse = courses.find(c => c.id === selectedCourseId) ?? null

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 bg-white border border-stone-200 shadow-sm rounded-full px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 transition"
      >
        <span>{selectedCourse?.name ?? 'Courses'}</span>
        <span aria-hidden className={`text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 max-w-[80vw] bg-white rounded-xl shadow-sm border border-stone-200 p-2 flex flex-col gap-2 z-40">
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide px-1 pt-1">All courses</p>
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {courses.map(c => (
              <button
                key={c.id}
                onClick={() => { setSelectedCourseId(c.id); setOpen(false) }}
                className={`text-left rounded-lg border transition px-3 py-2 min-w-0 ${
                  c.id === selectedCourseId ? 'border-green-600 bg-green-50 text-green-800' : 'border-stone-200 hover:bg-stone-50 text-stone-700'
                }`}
              >
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-stone-400 mt-0.5">{c.team_count} team{c.team_count === 1 ? '' : 's'} · code {c.join_code}</p>
              </button>
            ))}
            {courses.length === 0 && <p className="text-sm text-stone-400 italic px-1">No courses yet.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
