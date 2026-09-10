import { query, queryOne, withTransaction } from './db'
import { ChatComponent } from './chat-components'
import { generateMisalignmentSynthesis } from './ai'

// Single owning module for the HIGH-engagement-level 3-stage misalignment
// resolution flow (misalignment_submissions / misalignment_resolutions /
// misalignment_resolution_votes) — same "single owning module" convention as
// agreement-approvals.ts / task-approvals.ts. Every function is cycle-scoped
// (cycleNumber: 0 for the initial Reveal→Agree pass, 1|2 for a check-in
// re-flag), so a component's initial-pass flow and each check-in cycle's
// flow are fully independent rows.

// `cycle` travels as a query param (GET) / body field (POST/PATCH), defaulting
// to 0, not a path segment — matching existing precedent (GET
// /api/teams/[code]/discussion-timer?cycle=, POST /api/checkin-agreements
// body cycleNumber). 0 = initial Reveal→Agree pass, 1|2 = check-in cycles.
export function isMisalignmentCycleNumber(value: unknown): value is number {
  return value === 0 || value === 1 || value === 2
}

export class MisalignmentSkippedError extends Error {}
export class MisalignmentNotFoundError extends Error {}
export class MisalignmentInvalidActionError extends Error {}
export class MisalignmentConflictError extends Error {}

export type MisalignmentStage = 'own_pending' | 'waiting_for_team' | 'ready_to_synthesize' | 'drafting' | 'manual' | 'resolved'

export interface MisalignmentResolutionView {
  round: number
  rejectCount: number
  manualMode: boolean
  draftText: string | null
  approveCount: number
  myVote: 'approve' | 'reject' | null
}

export interface MisalignmentState {
  stage: MisalignmentStage
  teamSize: number
  actedCount: number
  mySubmissionStatus: 'submitted' | 'skipped' | null
  anonymizedAnswers: string[] | null
  resolution: MisalignmentResolutionView | null
}

interface ResolutionRow {
  id: string
  round: number
  reject_count: number
  manual_mode: boolean
  draft_text: string | null
  resolved_at: string | null
}

async function getTeamSize(teamId: string): Promise<number> {
  const rows = await query<{ team_size: number }>(
    'SELECT COUNT(*)::int AS team_size FROM members WHERE team_id = $1',
    [teamId]
  )
  return rows[0]?.team_size ?? 0
}

async function getAnonymizedSubmissions(teamId: string, component: ChatComponent, cycleNumber: number): Promise<string[]> {
  const rows = await query<{ content: string }>(
    `SELECT content FROM misalignment_submissions
     WHERE team_id = $1 AND component = $2 AND cycle_number = $3 AND status = 'submitted'
     ORDER BY id`,
    [teamId, component, cycleNumber]
  )
  return rows.map(r => r.content)
}

async function getResolutionRow(teamId: string, component: ChatComponent, cycleNumber: number): Promise<ResolutionRow | null> {
  return queryOne<ResolutionRow>(
    `SELECT id, round, reject_count, manual_mode, draft_text, resolved_at
     FROM misalignment_resolutions WHERE team_id = $1 AND component = $2 AND cycle_number = $3`,
    [teamId, component, cycleNumber]
  )
}

export async function getMisalignmentState(
  teamId: string,
  component: ChatComponent,
  cycleNumber: number,
  memberId: string
): Promise<MisalignmentState> {
  const teamSize = await getTeamSize(teamId)

  const submissions = await query<{ member_id: string; status: string }>(
    'SELECT member_id, status FROM misalignment_submissions WHERE team_id = $1 AND component = $2 AND cycle_number = $3',
    [teamId, component, cycleNumber]
  )
  const actedCount = submissions.length
  const mine = submissions.find(s => s.member_id === memberId)
  const mySubmissionStatus: 'submitted' | 'skipped' | null =
    mine === undefined ? null : mine.status === 'skipped' ? 'skipped' : 'submitted'

  let anonymizedAnswers: string[] | null = null
  if (actedCount >= teamSize) {
    anonymizedAnswers = await getAnonymizedSubmissions(teamId, component, cycleNumber)
  }

  const resolutionRow = await getResolutionRow(teamId, component, cycleNumber)

  let resolution: MisalignmentResolutionView | null = null
  if (resolutionRow) {
    const votes = await query<{ member_id: string; vote: string }>(
      'SELECT member_id, vote FROM misalignment_resolution_votes WHERE resolution_id = $1 AND round = $2',
      [resolutionRow.id, resolutionRow.round]
    )
    const approveCount = votes.filter(v => v.vote === 'approve').length
    const myVoteRow = votes.find(v => v.member_id === memberId)
    resolution = {
      round: resolutionRow.round,
      rejectCount: resolutionRow.reject_count,
      manualMode: resolutionRow.manual_mode,
      draftText: resolutionRow.draft_text,
      approveCount,
      myVote: myVoteRow === undefined ? null : myVoteRow.vote === 'approve' ? 'approve' : 'reject',
    }
  }

  let stage: MisalignmentStage
  if (mySubmissionStatus === null) stage = 'own_pending'
  else if (actedCount < teamSize) stage = 'waiting_for_team'
  else if (!resolutionRow) stage = 'ready_to_synthesize'
  else if (resolutionRow.resolved_at) stage = 'resolved'
  else if (resolutionRow.manual_mode) stage = 'manual'
  else stage = 'drafting'

  return { stage, teamSize, actedCount, mySubmissionStatus, anonymizedAnswers, resolution }
}

export async function recordMisalignmentAction(
  teamId: string,
  component: ChatComponent,
  cycleNumber: number,
  memberId: string,
  action: 'submit' | 'skip',
  content?: string
): Promise<void> {
  if (action === 'submit') {
    const trimmed = (content ?? '').trim()
    if (!trimmed) throw new MisalignmentInvalidActionError('Content is required to submit')
    await query(
      `INSERT INTO misalignment_submissions (team_id, component, cycle_number, member_id, status, content)
       VALUES ($1, $2, $3, $4, 'submitted', $5)
       ON CONFLICT (team_id, component, cycle_number, member_id) DO UPDATE
         SET status = 'submitted', content = $5, updated_at = NOW()`,
      [teamId, component, cycleNumber, memberId, trimmed]
    )
    return
  }

  await query(
    `INSERT INTO misalignment_submissions (team_id, component, cycle_number, member_id, status, content)
     VALUES ($1, $2, $3, $4, 'skipped', NULL)
     ON CONFLICT (team_id, component, cycle_number, member_id) DO UPDATE
       SET status = 'skipped', content = NULL, updated_at = NOW()`,
    [teamId, component, cycleNumber, memberId]
  )
}

export async function createSynthesisDraft(teamId: string, component: ChatComponent, cycleNumber: number): Promise<void> {
  const existing = await getResolutionRow(teamId, component, cycleNumber)
  if (existing) throw new MisalignmentConflictError('A resolution already exists for this component')

  const anonymizedSubmissions = await getAnonymizedSubmissions(teamId, component, cycleNumber)

  // All-skipped edge case: skip stage 2 entirely and go straight to manual
  // mode with an empty starting draft rather than calling the AI with
  // nothing to synthesize.
  if (anonymizedSubmissions.length === 0) {
    await query(
      `INSERT INTO misalignment_resolutions (team_id, component, cycle_number, round, reject_count, manual_mode, draft_text)
       VALUES ($1, $2, $3, 1, 0, true, NULL)
       ON CONFLICT (team_id, component, cycle_number) DO NOTHING`,
      [teamId, component, cycleNumber]
    )
    return
  }

  const clause = await generateMisalignmentSynthesis(component, anonymizedSubmissions)
  await query(
    `INSERT INTO misalignment_resolutions (team_id, component, cycle_number, round, reject_count, manual_mode, draft_text)
     VALUES ($1, $2, $3, 1, 0, false, $4)
     ON CONFLICT (team_id, component, cycle_number) DO NOTHING`,
    [teamId, component, cycleNumber, clause]
  )
}

export async function castMisalignmentVote(
  teamId: string,
  component: ChatComponent,
  cycleNumber: number,
  memberId: string,
  vote: 'approve' | 'reject'
): Promise<void> {
  const submission = await queryOne<{ status: string }>(
    'SELECT status FROM misalignment_submissions WHERE team_id = $1 AND component = $2 AND cycle_number = $3 AND member_id = $4',
    [teamId, component, cycleNumber, memberId]
  )
  if (submission?.status === 'skipped') {
    throw new MisalignmentSkippedError('You skipped this component and are exempt from voting')
  }

  const resolution = await getResolutionRow(teamId, component, cycleNumber)
  if (!resolution || resolution.resolved_at) {
    throw new MisalignmentNotFoundError('No draft to vote on')
  }
  if (resolution.manual_mode && vote === 'reject') {
    throw new MisalignmentInvalidActionError('Manual-mode drafts cannot be rejected — approve once ready')
  }

  await query(
    `INSERT INTO misalignment_resolution_votes (resolution_id, round, member_id, vote)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (resolution_id, round, member_id) DO UPDATE SET vote = $4`,
    [resolution.id, resolution.round, memberId, vote]
  )

  if (vote === 'reject') {
    // reject_count/manual_mode are bumped atomically off the live row (not
    // the earlier `resolution` read) so two concurrent rejects can't both
    // compute the same nextRejectCount and clobber each other.
    const updated = await queryOne<{ reject_count: number; manual_mode: boolean }>(
      `UPDATE misalignment_resolutions
       SET reject_count = reject_count + 1,
           manual_mode = (reject_count + 1) >= 2,
           round = round + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING reject_count, manual_mode`,
      [resolution.id]
    )
    if (!updated) throw new MisalignmentNotFoundError('No draft to vote on')

    if (updated.manual_mode) {
      // Two rejections force manual mode — the last draft becomes the
      // manual-edit starting point. Old-round votes are simply orphaned by
      // the round bump; that *is* "reopen approval for everyone" here,
      // since this table is round-scoped (no delete needed, unlike
      // clearAgreementApprovals).
      return
    }

    const anonymizedSubmissions = await getAnonymizedSubmissions(teamId, component, cycleNumber)
    const clause = await generateMisalignmentSynthesis(
      component,
      anonymizedSubmissions,
      resolution.draft_text ? { draftText: resolution.draft_text } : undefined
    )
    await query(
      `UPDATE misalignment_resolutions SET draft_text = $2, updated_at = NOW() WHERE id = $1`,
      [resolution.id, clause]
    )
    return
  }

  // approve — tally for the current round; once every non-skipped member has
  // approved, finalize into agreements/agreement_approvals.
  const teamSize = await getTeamSize(teamId)
  const skippedRows = await query<{ skipped_count: number }>(
    `SELECT COUNT(*)::int AS skipped_count FROM misalignment_submissions
     WHERE team_id = $1 AND component = $2 AND cycle_number = $3 AND status = 'skipped'`,
    [teamId, component, cycleNumber]
  )
  const skippedCount = skippedRows[0]?.skipped_count ?? 0
  const approveRows = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM misalignment_resolution_votes
     WHERE resolution_id = $1 AND round = $2 AND vote = 'approve'`,
    [resolution.id, resolution.round]
  )
  const approveCount = approveRows[0]?.count ?? 0
  if (approveCount >= teamSize - skippedCount) {
    await finalizeMisalignmentResolution(teamId, component, cycleNumber, memberId)
  }
}

export async function saveManualDraft(teamId: string, component: ChatComponent, cycleNumber: number, text: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) throw new MisalignmentInvalidActionError('Draft text is required')

  const updated = await query<{ id: string }>(
    `UPDATE misalignment_resolutions SET draft_text = $4, round = round + 1, updated_at = NOW()
     WHERE team_id = $1 AND component = $2 AND cycle_number = $3 AND manual_mode = true AND resolved_at IS NULL
     RETURNING id`,
    [teamId, component, cycleNumber, trimmed]
  )
  if (updated.length === 0) throw new MisalignmentNotFoundError('No manual-mode draft to update')
}

export async function finalizeMisalignmentResolution(
  teamId: string,
  component: ChatComponent,
  cycleNumber: number,
  finalizingMemberId: string
): Promise<void> {
  await withTransaction(async tx => {
    const resolutionRows = await tx.query<{ draft_text: string | null }>(
      'SELECT draft_text FROM misalignment_resolutions WHERE team_id=$1 AND component=$2 AND cycle_number=$3',
      [teamId, component, cycleNumber]
    )
    const resolution = resolutionRows[0]
    if (!resolution || !resolution.draft_text) throw new Error('No misalignment draft to finalize')

    await tx.query(
      `INSERT INTO agreements (team_id, component, resolution_note, draft_text, final_text, recorded_by)
       VALUES ($1, $2, NULL, $3, $3, $4)
       ON CONFLICT (team_id, component) DO UPDATE
         SET draft_text = $3, final_text = $3, recorded_by = $4, updated_at = NOW()`,
      [teamId, component, resolution.draft_text, finalizingMemberId]
    )

    const submissions = await tx.query<{ member_id: string; status: string }>(
      'SELECT member_id, status FROM misalignment_submissions WHERE team_id=$1 AND component=$2 AND cycle_number=$3',
      [teamId, component, cycleNumber]
    )
    for (const s of submissions) {
      await tx.query(
        `INSERT INTO agreement_approvals (team_id, component, member_id, via)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (team_id, component, member_id) DO UPDATE SET via = $4, approved_at = NOW()`,
        [teamId, component, s.member_id, s.status === 'skipped' ? 'skipped' : 'approved']
      )
    }

    // Check-in re-flags additionally record a per-cycle resolution note, same
    // as POST /api/checkin-agreements does today for the old flow (the
    // `resolutions` table's own CHECK only allows cycle_number IN (1,2), so
    // this never runs for the initial pass). HIGH has no separate PM-authored
    // note, so the finalized clause itself is stored as resolution_note.
    if (cycleNumber === 1 || cycleNumber === 2) {
      await tx.query(
        `INSERT INTO resolutions (team_id, component, cycle_number, resolution_note, resolved_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (team_id, component, cycle_number) DO UPDATE
           SET resolution_note = $4, resolved_by = $5, resolved_at = NOW()`,
        [teamId, component, cycleNumber, resolution.draft_text, finalizingMemberId]
      )
    }

    await tx.query('UPDATE misalignment_resolutions SET resolved_at = NOW() WHERE team_id=$1 AND component=$2 AND cycle_number=$3', [teamId, component, cycleNumber])
  })
}
