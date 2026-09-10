'use client'

import { useEffect, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, isResearcherUser } from '@/lib/session'

// The root layout (src/app/layout.tsx) already renders <UserBar /> above
// {children} for every page — researcher pages get the same topbar as the
// rest of the app for free and need no separate topbar component here.
export default function ResearcherLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { loading, user } = useSession()

  useEffect(() => {
    if (loading) return
    if (!isResearcherUser(user)) router.replace('/')
  }, [loading, user, router])

  if (loading || !isResearcherUser(user)) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-400 text-sm">Loading…</p>
      </main>
    )
  }

  return <>{children}</>
}
