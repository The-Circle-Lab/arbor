import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireOwnedMember } from '@/lib/auth/team-access'

export async function POST(req: Request) {
  const { memberId, responses } = await req.json()

  const owned = await requireOwnedMember(memberId)
  if (!owned) return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })

  await query(
    `UPDATE members SET subject_responses = $1 WHERE id = $2`,
    [JSON.stringify(responses), memberId]
  )

  return NextResponse.json({ ok: true })
}
