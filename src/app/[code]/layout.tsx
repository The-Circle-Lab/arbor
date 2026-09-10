'use client'

import { useEffect, useRef, ReactNode } from 'react'
import { usePathname, useParams, useRouter } from 'next/navigation'
import { useSession, getMembership } from '@/lib/session'
import type { CheckinAccessMode } from '@/lib/checkin-schedule'

interface TeamAccessResponse {
  checkinAccess: { mode: CheckinAccessMode; activeCycle: 1 | 2 | null }
}

// Central enforcement point for the scheduled-check-in gate: once a team has
// an agreement, the only pages it can reach are the dashboard, the agreement
// view, and the plant-health-history view — until its course's next
// check-in time arrives, at which point every team in that course is forced
// into that check-in flow, and returned to dashboard-only access once it's
// resolved. Every page still keeps its own membership guard/polling; this
// layout only adds the new restriction on top.
export default function CodeLayout({ children }: { children: ReactNode }) {
  const { code } = useParams<{ code: string }>()
  const pathname = usePathname()
  const router = useRouter()
  const { loading, user, memberships } = useSession()
  const membership = getMembership(memberships, code)

  // Guards the polling loop below against setting state / navigating after
  // the component has unmounted or the effect has been superseded by a
  // dependency change (e.g. a navigation mid-flight).
  const cancelledRef = useRef(false)
  useEffect(() => () => { cancelledRef.current = true }, [])

  useEffect(() => {
    if (loading) return
    if (!user || !membership) return

    const upperCode = code.toUpperCase()
    const hubPath = `/${code}`

    async function checkAccess() {
      try {
        const res = await fetch(`/api/teams/${upperCode}`)
        if (!res.ok || cancelledRef.current) return
        const data: TeamAccessResponse = await res.json()
        const { mode, activeCycle } = data.checkinAccess

        // No restriction pre-agreement.
        if (mode === 'onboarding') return

        // Let the hub's own effect decide the bare hub path — avoids the hub
        // and this layout fighting each other on the same poll tick.
        if (pathname === hubPath) return

        if (mode === 'waiting' || mode === 'done') {
          const allowed = [hubPath, `/${code}/start`, `/${code}/charter`, `/${code}/report`]
          const target = `/${code}/start`
          if (!allowed.includes(pathname) && pathname !== target) router.replace(target)
          return
        }

        if (mode === 'active' && activeCycle === 1) {
          const allowed = [
            hubPath, `/${code}/charter`, `/${code}/report`,
            `/${code}/plant-intro`, `/${code}/checkin/1`, `/${code}/plant/1`, `/${code}/checkin-agree/1`,
          ]
          const target = `/${code}/plant-intro`
          if (!allowed.includes(pathname) && pathname !== target) router.replace(target)
          return
        }

        if (mode === 'active' && activeCycle === 2) {
          const allowed = [
            hubPath, `/${code}/charter`, `/${code}/report`,
            `/${code}/checkin-intro`, `/${code}/checkin/2`, `/${code}/plant/2`, `/${code}/checkin-agree/2`,
          ]
          const target = `/${code}/checkin-intro`
          if (!allowed.includes(pathname) && pathname !== target) router.replace(target)
        }
      } catch { /* retry on next poll */ }
    }

    checkAccess()
    const interval = setInterval(checkAccess, 4000)
    return () => clearInterval(interval)
  }, [loading, user, membership, code, pathname, router])

  return <>{children}</>
}
