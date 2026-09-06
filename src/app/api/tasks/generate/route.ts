import { NextResponse } from 'next/server'
import { query, queryOne, withTransaction } from '@/lib/db'
import { generateTaskSuggestions, TaskMemberInput } from '@/lib/ai'
import { ChatComponent } from '@/lib/chat-components'
import { requireTeamMemberByTeamId } from '@/lib/auth/team-access'
import { toDeadlineUtc, formatDeadlineLocal } from '@/lib/dates'

class TasksAlreadyExistError extends Error {}

export async function POST(req: Request) {
  const { teamId } = await req.json()
  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

  const membership = await requireTeamMemberByTeamId(teamId)
  if (!membership) return NextResponse.json({ error: 'Not authorized for this team' }, { status: 403 })

  const existing = await queryOne('SELECT id FROM tasks WHERE team_id = $1', [teamId])
  if (existing) return NextResponse.json({ error: 'Tasks already exist for this team' }, { status: 400 })

  const team = await queryOne<{ project_title: string | null; deadline: string | null; assignment_brief: string | null }>(
    'SELECT project_title, deadline, assignment_brief FROM teams WHERE id = $1',
    [teamId]
  )

  const agreementRows = await query<{ component: string; final_text: string | null }>(
    'SELECT component, final_text FROM agreements WHERE team_id = $1',
    [teamId]
  )
  const agreements: Partial<Record<ChatComponent, string>> = {}
  for (const row of agreementRows) {
    if (row.final_text) agreements[row.component as ChatComponent] = row.final_text
  }

  const members = await query<{ id: string; display_name: string }>(
    `SELECT m.id, u.display_name
     FROM members m
     JOIN users u ON u.id = m.user_id
     WHERE m.team_id = $1
     ORDER BY m.joined_at`,
    [teamId]
  )

  const reflectionRows = await query<{ member_id: string; component: string; response_data: Record<string, unknown> }>(
    `SELECT ir.member_id, ir.component, ir.response_data
     FROM individual_reflections ir
     JOIN members m ON m.id = ir.member_id
     WHERE m.team_id = $1 AND ir.component = 'division_of_labor'`,
    [teamId]
  )
  const reflectionsByMember = new Map<string, { divisionOfLabor: Record<string, unknown> }>()
  for (const row of reflectionRows) {
    reflectionsByMember.set(row.member_id, { divisionOfLabor: row.response_data })
  }

  const memberInputs: TaskMemberInput[] = members.map(m => ({
    id: m.id,
    displayName: m.display_name,
    divisionOfLabor: reflectionsByMember.get(m.id)?.divisionOfLabor ?? {},
  }))

  const suggestions = await generateTaskSuggestions(
    {
      title: team?.project_title ?? null,
      brief: team?.assignment_brief ?? null,
      deadline: team?.deadline ?? null,
    },
    agreements,
    memberInputs
  )

  const memberIds = new Set(members.map(m => m.id))

  try {
    await withTransaction(async tx => {
      // Serialize concurrent generate calls for this team: the plain
      // check-then-act above is only a fast-path optimization (avoids a
      // wasted AI call in the common case) — this lock + re-check is what
      // actually prevents two simultaneous clicks from both inserting a
      // full task list.
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [teamId])

      const stillEmpty = await tx.query('SELECT id FROM tasks WHERE team_id = $1 LIMIT 1', [teamId])
      if (stillEmpty.length > 0) throw new TasksAlreadyExistError()

      for (const s of suggestions) {
        const assigneeId = s.assigneeMemberId && memberIds.has(s.assigneeMemberId) ? s.assigneeMemberId : null
        await tx.query(
          `INSERT INTO tasks (team_id, title, description, deadline, assigned_to)
           VALUES ($1, $2, $3, $4::timestamptz, $5)`,
          [teamId, s.title, s.description || null, toDeadlineUtc(s.deadline), assigneeId]
        )
      }
    })
  } catch (err) {
    if (err instanceof TasksAlreadyExistError) {
      return NextResponse.json({ error: 'Tasks already exist for this team' }, { status: 400 })
    }
    throw err
  }

  const tasks = await query<{ deadline: string | null; [key: string]: unknown }>(
    `SELECT t.id, t.title, t.description, t.status, t.deadline, t.assigned_to,
            au.display_name AS assignee_display_name, t.created_by, t.created_at, t.updated_at
     FROM tasks t
     LEFT JOIN members am ON am.id = t.assigned_to
     LEFT JOIN users au ON au.id = am.user_id
     WHERE t.team_id = $1
     ORDER BY t.deadline ASC NULLS LAST, t.created_at ASC`,
    [teamId]
  )

  const tasksWithLocalDeadline = tasks.map(t => ({ ...t, deadline_local: formatDeadlineLocal(t.deadline) }))

  return NextResponse.json({ tasks: tasksWithLocalDeadline })
}
