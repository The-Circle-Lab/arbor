'use client'

import { useState, SubmitEvent } from 'react'

type Screen = 'password' | 'menu'

export default function AdminPage() {
  const [screen, setScreen] = useState<Screen>('password')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

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

        <button onClick={handleLogout} className="w-full text-center text-sm text-stone-400 hover:text-stone-600 mt-8">
          Log out
        </button>
      </div>
    </main>
  )
}
