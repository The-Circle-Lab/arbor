import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireInstructorTeam } from '@/lib/auth/instructor'
import { ChatComponent } from '@/lib/chat-components'

// Read-only view of the same data src/app/[code]/charter/page.tsx (the
// team's own agreement view) renders — final agreement text per component
// plus per-cycle check-in discussion notes — scoped by instructor auth
// instead of team membership.
export async function GET(_req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await params
    const access = await requireInstructorTeam(teamId)
    if (!access) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const agreements = await query<{ component: ChatComponent; final_text: string | null; resolution_note: string | null }>(
      'SELECT component, final_text, resolution_note FROM agreements WHERE team_id = $1',
      [teamId]
    )

    const resolutions = await query<{ component: ChatComponent; cycle_number: number; resolution_note: string | null; resolved_at: string }>(
      'SELECT component, cycle_number, resolution_note, resolved_at FROM resolutions WHERE team_id = $1',
      [teamId]
    )

    return NextResponse.json({ agreements, resolutions })
  } catch (e) {
    console.error('GET /api/instructor/teams/[teamId]/agreements error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
