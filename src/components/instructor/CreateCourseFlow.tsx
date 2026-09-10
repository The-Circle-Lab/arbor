'use client'

// Shared "create a course" flow, used both by the CourseSwitcher's "+ New
// course" dropdown modal and the instructor welcome page's onboarding card.
import { useState } from 'react'

interface CreatedCourse {
  id: string
  join_code: string
}

interface UseCreateCourseOptions {
  // Called after a course is successfully created (and before `creating`
  // flips back to false), so callers can await follow-up work like
  // refreshing the course list or selecting the new course.
  onCreated?: (course: CreatedCourse) => void | Promise<void>
}

export function useCreateCourse({ onCreated }: UseCreateCourseOptions = {}) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdCode, setCreatedCode] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function submit() {
    if (!name.trim()) return
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
      setCreatedCode(data.join_code)
      setName('')
      await onCreated?.({ id: data.id, join_code: data.join_code })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setCreating(false)
    }
  }

  function reset() {
    setName('')
    setCreatedCode(null)
    setError('')
  }

  return { name, setName, creating, error, createdCode, submit, reset }
}

interface CreateCourseFormProps {
  name: string
  onNameChange: (value: string) => void
  onSubmit: () => void
  creating: boolean
  error: string
  autoFocus?: boolean
}

export function CreateCourseForm({ name, onNameChange, onSubmit, creating, error, autoFocus }: CreateCourseFormProps) {
  return (
    <div className="flex flex-col gap-3">
      <input
        className="border border-stone-300 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-600"
        placeholder="Course name (e.g. CS446)"
        value={name}
        onChange={e => onNameChange(e.target.value)}
        autoFocus={autoFocus}
      />
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        onClick={onSubmit}
        disabled={creating}
        className="w-full bg-green-700 text-white rounded-xl py-3 font-medium hover:bg-green-800 disabled:opacity-50 transition"
      >
        {creating ? 'Creating…' : 'Create course'}
      </button>
    </div>
  )
}

interface CreateCourseSuccessProps {
  joinCode: string
  onDone: () => void
  doneLabel?: string
}

export function CreateCourseSuccess({ joinCode, onDone, doneLabel = 'Done' }: CreateCourseSuccessProps) {
  return (
    <div>
      <p className="text-sm text-stone-600 mb-3">
        This is your course code — please share it with your students so they can join your class.
      </p>
      <p className="text-2xl font-mono font-bold tracking-widest text-center text-green-700 bg-stone-50 rounded-xl py-4 mb-4">
        {joinCode}
      </p>
      <button onClick={onDone} className="w-full bg-green-700 text-white rounded-xl py-3 font-medium hover:bg-green-800 transition">
        {doneLabel}
      </button>
    </div>
  )
}
