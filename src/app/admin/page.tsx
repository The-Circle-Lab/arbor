'use client'

import { useEffect, useState, SubmitEvent } from 'react'

type Screen = 'password' | 'menu'

interface ResearcherRow {
  id: string
  email: string
  display_name: string
  created_at: string
}

export default function AdminPage() {
  const [screen, setScreen] = useState<Screen>('password')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  const [researchers, setResearchers] = useState<ResearcherRow[]>([])
  const [researchersLoading, setResearchersLoading] = useState(false)
  const [researchersError, setResearchersError] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  async function loadResearchers() {
    setResearchersLoading(true)
    setResearchersError('')
    try {
      const res = await fetch('/api/admin/researchers')
      if (!res.ok) throw new Error('Could not load researchers.')
      const data: { researchers: ResearcherRow[] } = await res.json()
      setResearchers(data.researchers)
    } catch (e) {
      setResearchersError(e instanceof Error ? e.message : 'Could not load researchers.')
    } finally {
      setResearchersLoading(false)
    }
  }

  useEffect(() => {
    if (screen === 'menu') loadResearchers()
  }, [screen])

  async function handleLogin(e: SubmitEvent) {
    e.preventDefault()
    setLoggingIn(true)
    setLoginError('')
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
      setScreen('menu')
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoggingIn(false)
    }
  }

  async function handleLogout() {
    await fetch('/api/admin/logout', { method: 'POST' })
    setPassword('')
    setScreen('password')
  }

  async function handleCreateResearcher(e: SubmitEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateError('')
    try {
      const res = await fetch('/api/admin/researchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, password: newPassword, displayName: newDisplayName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
      setNewEmail('')
      setNewDisplayName('')
      setNewPassword('')
      await loadResearchers()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setCreating(false)
    }
  }

  if (screen === 'password') {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-stone-800 mb-1">Admin</h1>
            <p className="text-stone-500 text-sm">Demo scenario controls</p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <input
              type="password"
              className="border border-stone-300 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-600"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
            {loginError && <p className="text-red-500 text-sm">{loginError}</p>}
            <button
              type="submit"
              disabled={loggingIn || !password}
              className="w-full bg-green-700 text-white rounded-xl py-3 text-base font-medium hover:bg-green-800 disabled:opacity-50 transition"
            >
              {loggingIn ? 'Checking…' : 'Enter'}
            </button>
          </form>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-stone-50 p-4 md:p-8">
      <div className="max-w-md mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-stone-800 mb-1">Admin</h1>
          <p className="text-stone-500 text-sm">No demo scenarios are configured.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mb-6">
          <h2 className="text-lg font-bold text-stone-800 mb-4">Researchers</h2>

          <form onSubmit={handleCreateResearcher} className="flex flex-col gap-3 mb-6">
            <input
              type="email"
              className="border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-600"
              placeholder="Email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              autoComplete="off"
            />
            <input
              type="text"
              className="border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-600"
              placeholder="Display name"
              value={newDisplayName}
              onChange={e => setNewDisplayName(e.target.value)}
              autoComplete="off"
            />
            <input
              type="password"
              className="border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-600"
              placeholder="Password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            {createError && <p className="text-red-500 text-sm">{createError}</p>}
            <button
              type="submit"
              disabled={creating || !newEmail || !newDisplayName || !newPassword}
              className="w-full bg-green-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-50 transition"
            >
              {creating ? 'Creating…' : 'Create researcher'}
            </button>
          </form>

          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Existing researchers</p>
          {researchersLoading ? (
            <p className="text-sm text-stone-400">Loading…</p>
          ) : researchersError ? (
            <p className="text-sm text-red-600">{researchersError}</p>
          ) : researchers.length === 0 ? (
            <p className="text-sm text-stone-400 italic">No researcher accounts yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {researchers.map(r => (
                <li key={r.id} className="text-sm border border-stone-100 rounded-lg px-3 py-2">
                  <p className="text-stone-700 font-medium">{r.display_name}</p>
                  <p className="text-stone-400 text-xs">{r.email} · created {new Date(r.created_at).toLocaleDateString()}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button onClick={handleLogout} className="w-full text-center text-sm text-stone-400 hover:text-stone-600 mt-8">
          Log out
        </button>
      </div>
    </main>
  )
}
