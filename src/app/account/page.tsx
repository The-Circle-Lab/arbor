'use client'

import { useState, useEffect, SubmitEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArbourLogo } from '@/components/ArbourLogo'
import { useSession } from '@/lib/session'

export default function AccountPage() {
  const router = useRouter()
  const { loading, user } = useSession()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [loading, user, router])

  if (loading || !user) return null

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!currentPassword || !newPassword || !confirmPassword) {
      return setError('Please fill in all fields.')
    }
    if (newPassword.length < 8) {
      return setError('Password must be at least 8 characters.')
    }
    if (newPassword !== confirmPassword) {
      return setError('New password and confirmation do not match.')
    }
    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess('Password updated.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <ArbourLogo size={56} />
          </div>
          <h1 className="text-3xl font-bold text-stone-800 mb-1">Change password</h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            className="border border-stone-300 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-600"
            placeholder="Current password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
          <input
            type="password"
            className="border border-stone-300 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-600"
            placeholder="New password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
          <input
            type="password"
            className="border border-stone-300 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-600"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {success && <p className="text-green-700 text-sm">{success}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-green-700 text-white rounded-xl py-4 text-lg font-medium hover:bg-green-800 disabled:opacity-50 transition"
          >
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </form>

        <p className="text-center text-sm text-stone-500 mt-6">
          <button onClick={() => router.push('/')} className="text-green-700 font-medium hover:underline">
            ← Back to Arbour
          </button>
        </p>
      </div>
    </main>
  )
}
