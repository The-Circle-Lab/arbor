'use client'

import { useState, SubmitEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArbourLogo } from '@/components/ArbourLogo'
import { useSession } from '@/lib/session'

export default function SignupPage() {
  const router = useRouter()
  const { refresh } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [role, setRole] = useState<'student' | 'instructor'>('student')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!email.trim() || !password || !displayName.trim()) return setError('Please fill in all fields.')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName, pronouns, role }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
      await refresh()
      router.push('/')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <ArbourLogo size={56} />
          </div>
          <h1 className="text-3xl font-bold text-stone-800 mb-1">Create your account</h1>
          <p className="text-stone-500 text-sm">Get started with Arbour</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            className="border border-stone-300 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-600"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            type="password"
            className="border border-stone-300 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-600"
            placeholder="Password (min. 8 characters)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <input
            className="border border-stone-300 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-600"
            placeholder="Your name"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            autoComplete="name"
          />
          <select
            className="border border-stone-300 rounded-lg px-4 py-3 text-stone-800 bg-white focus:outline-none focus:ring-2 focus:ring-green-600"
            value={pronouns}
            onChange={e => setPronouns(e.target.value)}
          >
            <option value="">Pronouns (optional)</option>
            <option value="she/her">She/Her</option>
            <option value="he/him">He/Him</option>
            <option value="they/them">They/Them</option>
            <option value="prefer not to say">Prefer not to say</option>
          </select>
          <div className="flex rounded-lg border border-stone-300 overflow-hidden">
            <button
              type="button"
              onClick={() => setRole('student')}
              className={`flex-1 py-3 text-sm font-medium transition ${role === 'student' ? 'bg-green-700 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'}`}
            >
              I&apos;m a student
            </button>
            <button
              type="button"
              onClick={() => setRole('instructor')}
              className={`flex-1 py-3 text-sm font-medium transition ${role === 'instructor' ? 'bg-green-700 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'}`}
            >
              I&apos;m an instructor
            </button>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-700 text-white rounded-xl py-4 text-lg font-medium hover:bg-green-800 disabled:opacity-50 transition"
          >
            {loading ? 'Creating account…' : 'Sign up'}
          </button>
        </form>

        <p className="text-center text-sm text-stone-500 mt-6">
          Already have an account?{' '}
          <button onClick={() => router.push('/login')} className="text-green-700 font-medium hover:underline">
            Log in
          </button>
        </p>
      </div>
    </main>
  )
}
