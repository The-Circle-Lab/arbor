import { NextResponse } from 'next/server'
import { query, queryOne, withTransaction } from '@/lib/db'
import { requireInstructor } from '@/lib/auth/instructor'
import { generateUniqueJoinCode } from '@/lib/join-code'

export async function POST(req: Request) {
  try {
    const userId = await requireInstructor()
    if (!userId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const { name } = await req.json()
    if (typeof name !== 'string' || !name.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

    const join_code = await generateUniqueJoinCode(async code => {
      const existing = await queryOne('SELECT id FROM courses WHERE join_code = $1', [code])
      return existing !== null
    })

    const course = await withTransaction(async tx => {
      const inserted = await tx.query<{ id: string; name: string; join_code: string; created_at: string }>(
        'INSERT INTO courses (name, join_code, instructor_id) VALUES ($1, $2, $3) RETURNING id, name, join_code, created_at',
        [name.trim(), join_code, userId]
      )
      const row = inserted[0]
      if (!row) throw new Error('Course insert returned no row')

      await tx.query('INSERT INTO course_instructors (course_id, user_id, role) VALUES ($1, $2, $3)', [row.id, userId, 'owner'])

      return row
    })

    return NextResponse.json(course, { status: 201 })
  } catch (e) {
    console.error('POST /api/courses error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET() {
  try {
    const userId = await requireInstructor()
    if (!userId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const courses = await query<{
      id: string
      name: string
      join_code: string
      created_at: string
      team_count: number
      is_owner: boolean
    }>(
      `SELECT c.id, c.name, c.join_code, c.created_at, COUNT(t.id)::int AS team_count, ci.role = 'owner' AS is_owner
       FROM courses c
       JOIN course_instructors ci ON ci.course_id = c.id AND ci.user_id = $1
       LEFT JOIN teams t ON t.course_id = c.id
       WHERE c.deleted_at IS NULL
       GROUP BY c.id, ci.role
       ORDER BY c.created_at`,
      [userId]
    )

    return NextResponse.json({ courses })
  } catch (e) {
    console.error('GET /api/courses error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
