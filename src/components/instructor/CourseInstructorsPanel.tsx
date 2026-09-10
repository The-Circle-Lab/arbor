'use client'

// Modal content for managing a course's instructors, opened from the gear
// icon in CourseSwitcher. Mirrors the state-hook-plus-presentational split in
// CreateCourseFlow.tsx: useCourseInstructors owns the fetch/add/remove state,
// the component below renders it.
import { useCallback, useEffect, useState } from 'react'

export interface CourseInstructor {
  user_id: string
  email: string
  display_name: string
  role: 'owner' | 'instructor'
  added_at: string
}

function isCourseInstructorRole(value: string): value is CourseInstructor['role'] {
  return value === 'owner' || value === 'instructor'
}

function useCourseInstructors(courseId: string) {
  const [instructors, setInstructors] = useState<CourseInstructor[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [email, setEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  const [removingUserId, setRemovingUserId] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState('')

  const fetchInstructors = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch(`/api/courses/${courseId}/instructors`)
      if (!res.ok) { setLoadError('Could not load instructors.'); return }
      const data: { instructors: CourseInstructor[] } = await res.json()
      setInstructors(data.instructors)
    } catch {
      setLoadError('Could not load instructors.')
    } finally {
      setLoading(false)
    }
  }, [courseId])

  useEffect(() => {
    fetchInstructors()
  }, [fetchInstructors])

  async function submitAdd() {
    if (!email.trim()) return
    setAdding(true)
    setAddError('')
    try {
      const res = await fetch(`/api/courses/${courseId}/instructors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
      const role = typeof data.role === 'string' && isCourseInstructorRole(data.role) ? data.role : 'instructor'
      setInstructors(current => [...current, { ...data, role }])
      setEmail('')
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setAdding(false)
    }
  }

  async function removeInstructor(userId: string) {
    setRemovingUserId(userId)
    setRemoveError('')
    try {
      const res = await fetch(`/api/courses/${courseId}/instructors/${userId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Could not remove this instructor.')
      }
      setInstructors(current => current.filter(i => i.user_id !== userId))
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : 'Could not remove this instructor.')
    } finally {
      setRemovingUserId(null)
    }
  }

  return {
    instructors,
    loading,
    loadError,
    email,
    setEmail,
    adding,
    addError,
    submitAdd,
    removingUserId,
    removeError,
    removeInstructor,
  }
}

interface CourseInstructorsPanelProps {
  courseId: string
  isOwner: boolean
  currentUserId: string
}

export function CourseInstructorsPanel({ courseId, isOwner, currentUserId }: CourseInstructorsPanelProps) {
  const {
    instructors,
    loading,
    loadError,
    email,
    setEmail,
    adding,
    addError,
    submitAdd,
    removingUserId,
    removeError,
    removeInstructor,
  } = useCourseInstructors(courseId)

  return (
    <div className="flex flex-col gap-4">
      {loading && <p className="text-sm text-stone-400 italic">Loading instructors…</p>}
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}

      {!loading && !loadError && (
        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {instructors.map(i => {
            const isSelf = i.user_id === currentUserId
            const canRemove = i.role !== 'owner' && (isOwner || isSelf)
            return (
              <div
                key={i.user_id}
                className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-800 truncate">{i.display_name}</p>
                  <p className="text-xs text-stone-400 truncate">{i.email}</p>
                </div>
                {i.role === 'owner' && (
                  <span className="text-xs font-semibold text-green-700 bg-green-50 rounded-full px-2 py-0.5">Owner</span>
                )}
                {canRemove && (
                  <button
                    onClick={() => removeInstructor(i.user_id)}
                    disabled={removingUserId === i.user_id}
                    className="px-2 py-1 text-xs text-stone-400 hover:text-red-600 disabled:opacity-50 transition"
                  >
                    {removingUserId === i.user_id ? '…' : isSelf ? 'Leave' : 'Remove'}
                  </button>
                )}
              </div>
            )
          })}
          {instructors.length === 0 && <p className="text-sm text-stone-400 italic px-1">No instructors yet.</p>}
        </div>
      )}
      {removeError && <p className="text-sm text-red-600">{removeError}</p>}

      <div className="flex flex-col gap-2 pt-2 border-t border-stone-100">
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Add instructor</p>
        <div className="flex gap-2">
          <input
            className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-600"
            placeholder="Instructor email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <button
            onClick={submitAdd}
            disabled={adding}
            className="bg-green-700 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-50 transition"
          >
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
        {addError && <p className="text-sm text-red-600">{addError}</p>}
      </div>
    </div>
  )
}
