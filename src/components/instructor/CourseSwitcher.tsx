'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession, isInstructorUser } from '@/lib/session'
import { useInstructorCourses } from '@/lib/instructor-context'
import { Modal } from '@/components/Modal'
import { useCreateCourse, CreateCourseForm, CreateCourseSuccess } from '@/components/instructor/CreateCourseFlow'

// The course switcher lives inline in the global navbar (UserBar), between
// the "Logged in as" text and "Log out" — a small anchored dropdown rather
// than the earlier floating-button + full-screen-drawer pattern.
export function CourseSwitcher() {
  const { user } = useSession()
  const { courses, selectedCourseId, setSelectedCourseId, refreshCourses } = useInstructorCourses()
  const [open, setOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const { name: newCourseName, setName: setNewCourseName, creating, error, createdCode, submit: handleCreateCourse, reset: resetCreateCourse } = useCreateCourse({
    onCreated: async course => {
      await refreshCourses()
      setSelectedCourseId(course.id)
    },
  })
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
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

  if (!isInstructorUser(user)) return null

  const selectedCourse = courses.find(c => c.id === selectedCourseId) ?? null

  function closeModal() {
    setModalOpen(false)
    resetCreateCourse()
  }

  async function confirmDeleteCourse() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/courses/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) { setDeleteError('Could not delete this course.'); return }
      await refreshCourses()
      setDeleteTarget(null)
    } catch {
      setDeleteError('Could not delete this course.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
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
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide px-1 pt-1">Your courses</p>
            <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
              {courses.map(c => (
                <div
                  key={c.id}
                  className={`flex items-center gap-1 rounded-lg border transition ${
                    c.id === selectedCourseId ? 'border-green-600 bg-green-50 text-green-800' : 'border-stone-200 hover:bg-stone-50 text-stone-700'
                  }`}
                >
                  <button
                    onClick={() => { setSelectedCourseId(c.id); setOpen(false) }}
                    className="flex-1 text-left px-3 py-2 min-w-0"
                  >
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-stone-400 mt-0.5">{c.team_count} team{c.team_count === 1 ? '' : 's'} · code {c.join_code}</p>
                  </button>
                  <button
                    onClick={() => { setDeleteTarget({ id: c.id, name: c.name }); setDeleteError(''); setOpen(false) }}
                    aria-label={`Delete ${c.name}`}
                    className="px-2 text-stone-300 hover:text-red-600 transition"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {courses.length === 0 && <p className="text-sm text-stone-400 italic px-1">No courses yet.</p>}
            </div>
            <button
              onClick={() => { setModalOpen(true); setOpen(false) }}
              className="w-full border-2 border-green-700 text-green-700 rounded-lg py-2 text-sm font-medium hover:bg-green-50 transition"
            >
              + New course
            </button>
          </div>
        )}
      </div>

      <Modal open={modalOpen} labelledBy="new-course-title" onClose={closeModal}>
        <div className="p-6">
          <h2 id="new-course-title" className="text-lg font-bold text-stone-800 mb-4">New course</h2>
          {createdCode ? (
            <CreateCourseSuccess joinCode={createdCode} onDone={closeModal} />
          ) : (
            <CreateCourseForm
              name={newCourseName}
              onNameChange={setNewCourseName}
              onSubmit={handleCreateCourse}
              creating={creating}
              error={error}
              autoFocus
            />
          )}
        </div>
      </Modal>

      <Modal open={!!deleteTarget} labelledBy="delete-course-title" onClose={() => { setDeleteTarget(null); setDeleteError('') }}>
        <div className="p-6">
          <h2 id="delete-course-title" className="text-lg font-bold text-stone-800 mb-4">Delete course</h2>
          <p className="text-sm text-stone-600 mb-6">
            Delete &quot;{deleteTarget?.name}&quot;? Students won&apos;t be able to join it anymore, and you won&apos;t be able to see its teams&apos; data in your dashboard again. This can&apos;t be undone.
          </p>
          {deleteError && <p className="text-sm text-red-600 mb-4">{deleteError}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setDeleteTarget(null); setDeleteError('') }}
              className="px-3 py-1.5 border border-stone-200 text-stone-600 text-sm rounded-lg hover:bg-stone-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={confirmDeleteCourse}
              disabled={deleting}
              className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
