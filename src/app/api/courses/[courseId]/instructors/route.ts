import { NextResponse } from 'next/server'
import { query, queryOne, isUniqueViolation } from '@/lib/db'
import { requireCourseAccess } from '@/lib/auth/instructor'

export async function GET(_req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  try {
    const { courseId } = await params
    const userId = await requireCourseAccess(courseId)
    if (!userId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const instructors = await query<{
      user_id: string
      email: string
      display_name: string
      role: string
      added_at: string
    }>(
      `SELECT u.id AS user_id, u.email, u.display_name, ci.role, ci.added_at
       FROM course_instructors ci
       JOIN users u ON u.id = ci.user_id
       WHERE ci.course_id = $1
       ORDER BY (ci.role = 'owner') DESC, ci.added_at`,
      [courseId]
    )

    return NextResponse.json({ instructors })
  } catch (e) {
    console.error('GET /api/courses/[courseId]/instructors error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  try {
    const { courseId } = await params
    const userId = await requireCourseAccess(courseId)
    if (!userId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const { email } = await req.json()
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
    if (!normalizedEmail) return NextResponse.json({ error: 'Email required' }, { status: 400 })

    const target = await queryOne<{ id: string; role: string }>('SELECT id, role FROM users WHERE email = $1', [normalizedEmail])
    if (!target) return NextResponse.json({ error: 'No account found with that email.' }, { status: 404 })
    if (target.role !== 'instructor') {
      return NextResponse.json({ error: 'That user is not an instructor.' }, { status: 400 })
    }

    const existing = await queryOne('SELECT id FROM course_instructors WHERE course_id = $1 AND user_id = $2', [courseId, target.id])
    if (existing) return NextResponse.json({ error: 'That instructor is already on this course.' }, { status: 400 })

    let inserted: { user_id: string; email: string; display_name: string; role: string; added_at: string }
    try {
      const row = await queryOne<{ user_id: string; email: string; display_name: string; role: string; added_at: string }>(
        `WITH inserted AS (
           INSERT INTO course_instructors (course_id, user_id, role) VALUES ($1, $2, 'instructor')
           RETURNING user_id, role, added_at
         )
         SELECT inserted.user_id, u.email, u.display_name, inserted.role, inserted.added_at
         FROM inserted JOIN users u ON u.id = inserted.user_id`,
        [courseId, target.id]
      )
      if (!row) throw new Error('Instructor insert returned no row')
      inserted = row
    } catch (e) {
      if (isUniqueViolation(e)) {
        return NextResponse.json({ error: 'That instructor is already on this course.' }, { status: 400 })
      }
      throw e
    }

    return NextResponse.json(inserted, { status: 201 })
  } catch (e) {
    console.error('POST /api/courses/[courseId]/instructors error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
