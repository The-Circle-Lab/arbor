import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireCourseOwner } from '@/lib/auth/instructor'

// Soft delete only: sets courses.deleted_at so the course disappears from the
// instructor's course list and its join code stops resolving for new teams.
// Every row referencing it (teams, checkins, agreements, plant_states,
// instructor_summaries, ...) is left exactly as-is in the database, but note
// that requireCourseOwner/requireInstructorTeam (src/lib/auth/instructor.ts)
// require deleted_at IS NULL, so that data becomes unreachable through the
// app's instructor routes too — there is currently no restore/undelete path.
export async function DELETE(_req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  try {
    const { courseId } = await params
    const userId = await requireCourseOwner(courseId)
    if (!userId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    await query('UPDATE courses SET deleted_at = NOW() WHERE id = $1', [courseId])

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/courses/[courseId] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
