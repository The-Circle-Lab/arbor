import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
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

    const course = await queryOne<{ id: string; name: string; join_code: string; created_at: string }>(
      'INSERT INTO courses (name, join_code, instructor_id) VALUES ($1, $2, $3) RETURNING id, name, join_code, created_at',
      [name.trim(), join_code, userId]
    )

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

    const courses = await query<{ id: string; name: string; join_code: string; created_at: string; team_count: number }>(
      `SELECT c.id, c.name, c.join_code, c.created_at, COUNT(t.id)::int AS team_count
       FROM courses c
       LEFT JOIN teams t ON t.course_id = c.id
       WHERE c.instructor_id = $1 AND c.deleted_at IS NULL
       GROUP BY c.id
       ORDER BY c.created_at`,
      [userId]
    )

    return NextResponse.json({ courses })
  } catch (e) {
    console.error('GET /api/courses error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
