import { NextResponse } from 'next/server'
import { query, queryOne, withTransaction } from '@/lib/db'
import { requireUser } from '@/lib/auth/jwt'
import { requireOwnedMember, requireTeamMemberByTeamId } from '@/lib/auth/team-access'
import { generateUniqueJoinCode } from '@/lib/join-code'

// Advisory-lock classid for team vote writes (plant / project-manager).
// Paired with pg_advisory_xact_lock's 2-arg form so this can't collide with
// plant-health.ts's LEDGER_LOCK_CLASS (1) — see the comment on LEDGER_LOCK_CLASS.
const TEAM_VOTE_LOCK_CLASS = 2

function isPlantVoteBody(value: unknown): value is { memberId: string; plantType: string } {
  return typeof value === 'object' && value !== null &&
    'memberId' in value && 'plantType' in value &&
    typeof value.memberId === 'string' && typeof value.plantType === 'string'
}

function isProjectManagerVoteBody(value: unknown): value is { memberId: string; votedForMemberId: string } {
  return typeof value === 'object' && value !== null &&
    'memberId' in value && 'votedForMemberId' in value &&
    typeof value.memberId === 'string' && typeof value.votedForMemberId === 'string'
}

type PlantVoteResult =
  | { ok: true; agreed: boolean; votes: Record<string, string>; plantType: string | null }
  | { ok: false; error: string }

type ProjectManagerVoteResult =
  | { ok: true; agreed: boolean; votes: Record<string, string>; projectManagerId: string | null }
  | { ok: false; error: string }

export async function POST(req: Request) {
  try {
    const userId = await requireUser()
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { name, courseJoinCode } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

    let courseId: string | null = null
    if (typeof courseJoinCode === 'string' && courseJoinCode.trim()) {
      const course = await queryOne<{ id: string }>(
        'SELECT id FROM courses WHERE join_code = $1 AND deleted_at IS NULL',
        [courseJoinCode.trim().toUpperCase()]
      )
      if (!course) return NextResponse.json({ error: 'Course code not found' }, { status: 400 })
      courseId = course.id
    }

    const join_code = await generateUniqueJoinCode(async code => {
      const existing = await queryOne('SELECT id FROM teams WHERE join_code = $1', [code])
      return existing !== null
    })

    const team = await queryOne<{ id: string; name: string; join_code: string }>(
      'INSERT INTO teams (name, join_code, course_id) VALUES ($1, $2, $3) RETURNING id, name, join_code',
      [name.trim(), join_code, courseId]
    )

    return NextResponse.json(team, { status: 201 })
  } catch (e) {
    console.error('POST /api/teams error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { teamId, projectTitle, deadline, assignmentBrief, plantVote, projectManagerVote } = await req.json()
    if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

    if (projectManagerVote) {
      if (!isProjectManagerVoteBody(projectManagerVote)) {
        return NextResponse.json({ error: 'Invalid projectManagerVote payload' }, { status: 400 })
      }
      const { memberId, votedForMemberId } = projectManagerVote

      const owned = await requireOwnedMember(memberId)
      if (!owned || owned.teamId !== teamId) {
        return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })
      }

      const result = await withTransaction<ProjectManagerVoteResult>(async tx => {
        // Advisory-locked so two members voting at the same instant don't
        // clobber each other's entry in the shared votes blob.
        await tx.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [TEAM_VOTE_LOCK_CLASS, teamId])

        const [team] = await tx.query<{ project_manager_votes: Record<string, string> | null; project_manager_id: string | null }>(
          'SELECT project_manager_votes, project_manager_id FROM teams WHERE id = $1', [teamId]
        )

        // The project manager is fixed for the life of the group once elected — no re-votes.
        if (team?.project_manager_id) {
          return { ok: true, agreed: true, votes: team.project_manager_votes ?? {}, projectManagerId: team.project_manager_id }
        }

        const members = await tx.query<{ id: string }>('SELECT id FROM members WHERE team_id = $1', [teamId])
        if (!members.some(m => m.id === votedForMemberId)) {
          return { ok: false, error: 'votedForMemberId is not a member of this team' }
        }

        const votes: Record<string, string> = { ...(team?.project_manager_votes ?? {}), [memberId]: votedForMemberId }
        const allVoted = members.every(m => votes[m.id])
        const agreed = allVoted && new Set(Object.values(votes)).size === 1

        if (agreed) {
          await tx.query(
            'UPDATE teams SET project_manager_votes = $1, project_manager_id = $2 WHERE id = $3',
            [JSON.stringify(votes), votedForMemberId, teamId]
          )
        } else {
          await tx.query(
            'UPDATE teams SET project_manager_votes = $1 WHERE id = $2',
            [JSON.stringify(votes), teamId]
          )
        }

        return { ok: true, agreed, votes, projectManagerId: agreed ? votedForMemberId : null }
      })

      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
      return NextResponse.json(result)
    }

    if (plantVote) {
      if (!isPlantVoteBody(plantVote)) {
        return NextResponse.json({ error: 'Invalid plantVote payload' }, { status: 400 })
      }
      const { memberId, plantType } = plantVote

      const owned = await requireOwnedMember(memberId)
      if (!owned || owned.teamId !== teamId) {
        return NextResponse.json({ error: 'Not authorized for this member' }, { status: 403 })
      }

      const result = await withTransaction<PlantVoteResult>(async tx => {
        // Advisory-locked so two members voting at the same instant don't
        // clobber each other's entry in the shared votes blob.
        await tx.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [TEAM_VOTE_LOCK_CLASS, teamId])

        const [team] = await tx.query<{ plant_votes: Record<string, string> | null; project_manager_id: string | null }>(
          'SELECT plant_votes, project_manager_id FROM teams WHERE id = $1', [teamId]
        )

        // A project manager must be elected before the team can vote on a
        // plant — guards against reaching this action without going through
        // /choose-project-manager first (e.g. a stale link or direct nav).
        if (!team?.project_manager_id) {
          return { ok: false, error: 'Team must choose a project manager before picking a plant' }
        }

        const votes: Record<string, string> = { ...(team.plant_votes ?? {}), [memberId]: plantType }

        const members = await tx.query<{ id: string }>('SELECT id FROM members WHERE team_id = $1', [teamId])
        const allVoted = members.every(m => votes[m.id])
        const agreed = allVoted && new Set(Object.values(votes)).size === 1

        if (agreed) {
          await tx.query(
            'UPDATE teams SET plant_votes = $1, plant_type = $2 WHERE id = $3',
            [JSON.stringify(votes), plantType, teamId]
          )
        } else {
          await tx.query(
            'UPDATE teams SET plant_votes = $1 WHERE id = $2',
            [JSON.stringify(votes), teamId]
          )
        }

        return { ok: true, agreed, votes, plantType: agreed ? plantType : null }
      })

      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })
      return NextResponse.json(result)
    }

    const membership = await requireTeamMemberByTeamId(teamId)
    if (!membership) {
      return NextResponse.json({ error: 'Not authorized for this team' }, { status: 403 })
    }

    await query(
      `UPDATE teams SET
        project_title = COALESCE($2, project_title),
        deadline = COALESCE($3::date, deadline),
        assignment_brief = COALESCE($4, assignment_brief)
       WHERE id = $1`,
      [teamId, projectTitle ?? null, deadline ?? null, assignmentBrief ?? null]
    )

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PATCH /api/teams error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
