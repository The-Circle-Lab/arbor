'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export interface SessionUser {
  id: string
  email: string
  display_name: string
  pronouns: string | null
  role: 'student' | 'instructor'
}

export interface Membership {
  member_id: string
  team_id: string
  join_code: string
  team_name: string
}

interface SessionData {
  user: SessionUser | null
  memberships: Membership[]
}

async function fetchSession(): Promise<SessionData> {
  try {
    const res = await fetch('/api/auth/me')
    const data = await res.json()
    return { user: data.user ?? null, memberships: data.memberships ?? [] }
  } catch {
    return { user: null, memberships: [] }
  }
}

interface SessionContextValue {
  loading: boolean
  user: SessionUser | null
  memberships: Membership[]
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])

  async function refresh() {
    const data = await fetchSession()
    setUser(data.user)
    setMemberships(data.memberships)
  }

  useEffect(() => {
    let ignore = false
    fetchSession().then(data => {
      if (ignore) return
      setUser(data.user)
      setMemberships(data.memberships)
      setLoading(false)
    })
    return () => { ignore = true }
  }, [])

  return (
    <SessionContext.Provider value={{ loading, user, memberships, refresh }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within a SessionProvider')
  return ctx
}

export function getMembership(memberships: Membership[], code: string): Membership | null {
  const upper = code.toUpperCase()
  return memberships.find(m => m.join_code === upper) ?? null
}

export function isInstructorUser(user: SessionUser | null): boolean {
  return user?.role === 'instructor'
}
