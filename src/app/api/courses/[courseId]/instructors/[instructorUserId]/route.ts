import { validate as isUuid } from 'uuid'
import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { requireCourseAccess, requireCourseOwner } from '@/lib/auth/instructor'

// Removal/leave rules:
// - The owner row can never be removed — deleting the course (owner-only) is
//   the only way to end it.
// - Removing someone else requires the actor to be the course owner.
// - Removing yourself ("leave") is always allowed once the owner check above
//   has excluded the owner leaving.
export async function DELETE(_req: Request, { params }: { params: Promise<{ courseId: string; instructorUserId: string }> }) {
  try {
    const { courseId, instructorUserId } = await params
    if (!isUuid(instructorUserId)) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const actorUserId = await requireCourseAccess(courseId)
    if (!actorUserId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const target = await queryOne<{ role: string }>(
      'SELECT role FROM course_instructors WHERE course_id = $1 AND user_id = $2',
      [courseId, instructorUserId]
    )
    if (!target) return NextResponse.json({ error: 'Instructor not found' }, { status: 404 })

    if (target.role === 'owner') {
      return NextResponse.json({ error: "The course owner can't be removed — delete the course instead." }, { status: 403 })
    }

    if (actorUserId !== instructorUserId) {
      const ownerId = await requireCourseOwner(courseId)
      if (!ownerId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    await query('DELETE FROM course_instructors WHERE course_id = $1 AND user_id = $2', [courseId, instructorUserId])

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/courses/[courseId]/instructors/[instructorUserId] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
