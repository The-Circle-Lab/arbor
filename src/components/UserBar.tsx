'use client'

import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/session'
import { CourseSwitcher } from '@/components/instructor/CourseSwitcher'

export function UserBar() {
  const router = useRouter()
  const { loading, user, refresh } = useSession()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    await refresh()
    router.push('/login')
    router.refresh()
  }

  if (loading || !user) return null

  return (
    <div className="flex items-center justify-between bg-stone-50 px-4 py-3 sm:px-6">
      <span className="text-xs text-stone-400">
        Logged in as <span className="font-medium text-stone-600">{user.display_name}</span>
      </span>
      <div className="flex items-center gap-3">
        <CourseSwitcher />
        <button onClick={handleLogout} className="text-xs text-stone-400 hover:text-stone-600 underline">
          Log out
        </button>
      </div>
    </div>
  )
}
