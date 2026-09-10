'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession, isInstructorUser } from '@/lib/session'
import { useInstructorCourses } from '@/lib/instructor-context'
import { Modal } from '@/components/Modal'
import { useCreateCourse, CreateCourseForm, CreateCourseSuccess } from '@/components/instructor/CreateCourseFlow'
import { CourseInstructorsPanel } from '@/components/instructor/CourseInstructorsPanel'

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
  // Same confirm-modal shape covers two actions, chosen by isOwner: the
  // owner deletes the course outright, a co-instructor instead leaves it —
  // a co-instructor is never allowed to delete a course they don't own.
  const [actionTarget, setActionTarget] = useState<{ id: string; name: string; isOwner: boolean } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [settingsTarget, setSettingsTarget] = useState<{ id: string; name: string; isOwner: boolean } | null>(null)
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

  if (!user || !isInstructorUser(user)) return null

  const selectedCourse = courses.find(c => c.id === selectedCourseId) ?? null

  function closeModal() {
    setModalOpen(false)
    resetCreateCourse()
  }

  async function confirmDeleteOrLeave() {
    if (!actionTarget || !user) return
    setDeleting(true)
    setDeleteError('')
    try {
      const url = actionTarget.isOwner
        ? `/api/courses/${actionTarget.id}`
        : `/api/courses/${actionTarget.id}/instructors/${user.id}`
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) {
        setDeleteError(actionTarget.isOwner ? 'Could not delete this course.' : 'Could not leave this course.')
        return
      }
      await refreshCourses()
      setActionTarget(null)
    } catch {
      setDeleteError(actionTarget.isOwner ? 'Could not delete this course.' : 'Could not leave this course.')
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
                    onClick={() => { setSettingsTarget({ id: c.id, name: c.name, isOwner: c.is_owner }); setOpen(false) }}
                    aria-label={`Manage instructors for ${c.name}`}
                    className="px-2 text-stone-300 hover:text-stone-600 transition"
                  >
                    ⚙
                  </button>
                  <button
                    onClick={() => {
                      setActionTarget({ id: c.id, name: c.name, isOwner: c.is_owner })
                      setDeleteError('')
                      setOpen(false)
                    }}
                    aria-label={c.is_owner ? `Delete ${c.name}` : `Leave ${c.name}`}
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

      <Modal open={!!actionTarget} labelledBy="delete-course-title" onClose={() => { setActionTarget(null); setDeleteError('') }}>
        <div className="p-6">
          <h2 id="delete-course-title" className="text-lg font-bold text-stone-800 mb-4">
            {actionTarget?.isOwner ? 'Delete course' : 'Leave course'}
          </h2>
          <p className="text-sm text-stone-600 mb-6">
            {actionTarget?.isOwner ? (
              <>Delete &quot;{actionTarget?.name}&quot;? Students won&apos;t be able to join it anymore, and you won&apos;t be able to see its teams&apos; data in your dashboard again. This can&apos;t be undone.</>
            ) : (
              <>Leave &quot;{actionTarget?.name}&quot;? You&apos;ll lose access to its teams&apos; data unless another instructor adds you back.</>
            )}
          </p>
          {deleteError && <p className="text-sm text-red-600 mb-4">{deleteError}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setActionTarget(null); setDeleteError('') }}
              className="px-3 py-1.5 border border-stone-200 text-stone-600 text-sm rounded-lg hover:bg-stone-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={confirmDeleteOrLeave}
              disabled={deleting}
              className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
            >
              {deleting ? (actionTarget?.isOwner ? 'Deleting…' : 'Leaving…') : (actionTarget?.isOwner ? 'Delete' : 'Leave')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!settingsTarget} labelledBy="course-instructors-title" onClose={() => setSettingsTarget(null)}>
        <div className="p-6">
          <h2 id="course-instructors-title" className="text-lg font-bold text-stone-800 mb-4">
            Instructors — {settingsTarget?.name}
          </h2>
          {settingsTarget && (
            <CourseInstructorsPanel courseId={settingsTarget.id} isOwner={settingsTarget.isOwner} currentUserId={user.id} />
          )}
        </div>
      </Modal>
    </>
  )
}
