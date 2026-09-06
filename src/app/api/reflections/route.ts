import { NextResponse } from 'next/server'
import { withTransaction } from '@/lib/db'
import { CHAT_COMPONENTS } from '@/lib/chat-components'
import { requireOwnedMember } from '@/lib/auth/team-access'

export async function POST(req: Request) {
  const { memberId, responses, subjectResponses } = await req.json()

  const owned = await requireOwnedMember(memberId)
  if (!owned) return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })

  await withTransaction(async tx => {
    for (const component of CHAT_COMPONENTS) {
      if (!responses[component]) continue
      await tx.query(
        `INSERT INTO individual_reflections (member_id, component, response_data)
         VALUES ($1, $2, $3)
         ON CONFLICT (member_id, component) DO UPDATE SET response_data = $3, submitted_at = NOW()`,
        [memberId, component, JSON.stringify(responses[component])]
      )
    }

    await tx.query(
      `UPDATE members SET subject_responses = $1 WHERE id = $2`,
      [JSON.stringify(subjectResponses ?? {}), memberId]
    )
  })

  return NextResponse.json({ ok: true })
}
