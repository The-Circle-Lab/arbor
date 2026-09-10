import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/admin'

interface AdminTeamRow {
  id: string
  name: string
  join_code: string
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const teams = await query<AdminTeamRow>(
    `SELECT t.id, t.name, t.join_code
     FROM teams t
     ORDER BY t.name`
  )

  return NextResponse.json({ teams })
}
