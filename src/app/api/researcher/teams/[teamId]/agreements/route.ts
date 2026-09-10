import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireResearcherTeam } from '@/lib/auth/researcher'
import { ChatComponent } from '@/lib/chat-components'

// Read-only copy of src/app/api/instructor/teams/[teamId]/agreements/route.ts,
// scoped by researcher auth instead of instructor auth.
export async function GET(_req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await params
    const access = await requireResearcherTeam(teamId)
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
    console.error('GET /api/researcher/teams/[teamId]/agreements error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
