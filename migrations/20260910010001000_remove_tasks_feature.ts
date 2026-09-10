import type { MigrationBuilder } from 'node-pg-migrate'

// The tasks feature (task list, submissions, deadline-consensus workflow) is
// being removed entirely in favor of the new scheduled check-in dashboard —
// it no longer fits the new model, since the dashboard must be reachable
// directly after agreement, not after a task-approval step.
//
// CASCADE drops plant_health_events.task_id's now-dangling foreign key
// constraint automatically. It does NOT drop the plant_health_events table,
// the task_id column, or any of its rows, and does not touch its `source`
// CHECK constraint — historical deadline_missed/task_recovered rows from the
// old task workflow are preserved as-is; only the tables backing *future*
// task-driven events are dropped here.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE IF EXISTS task_deadline_proposal_responses, task_deadline_proposals,
      task_deadline_votes, task_deadline_events, task_submission_comments,
      task_submission_votes, task_submissions, task_approvals, tasks CASCADE;
    DROP TYPE IF EXISTS task_status;
  `)
}

// This migration cannot be meaningfully reversed — the dropped tables'
// *data* is gone for good. down() restores only the table/type
// *structures*, copying the original CREATE TABLE/CREATE TYPE statements
// from 20260715024413000_add_tasks.ts, 20260718120000000_add_task_submissions.ts
// and 20260720000000000_add_task_consensus.ts. Historical row data is not
// recoverable.
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
        CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done');
      END IF;
    END$$;

    CREATE TABLE IF NOT EXISTS tasks (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id      UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      description  TEXT,
      status       task_status NOT NULL DEFAULT 'todo',
      deadline     TIMESTAMPTZ,
      assigned_to  UUID REFERENCES members(id) ON DELETE SET NULL,
      created_by   UUID REFERENCES members(id) ON DELETE SET NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS task_approvals (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      member_id   UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(team_id, member_id)
    );

    ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'submitted';

    CREATE TABLE IF NOT EXISTS task_submissions (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id      UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      submitted_by UUID REFERENCES members(id) ON DELETE SET NULL,
      content      TEXT NOT NULL,
      url          TEXT,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      summary      TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_task_submissions_task_id ON task_submissions(task_id);

    CREATE TABLE IF NOT EXISTS task_submission_votes (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      submission_id UUID NOT NULL REFERENCES task_submissions(id) ON DELETE CASCADE,
      member_id     UUID REFERENCES members(id) ON DELETE SET NULL,
      vote          TEXT NOT NULL CHECK (vote IN ('approve','decline')),
      reason        TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT task_submission_votes_reason_required
        CHECK (vote = 'approve' OR (reason IS NOT NULL AND length(trim(reason)) > 0))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS task_submission_votes_uq
      ON task_submission_votes (submission_id, member_id) WHERE member_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS task_submission_comments (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      submission_id UUID NOT NULL REFERENCES task_submissions(id) ON DELETE CASCADE,
      member_id     UUID REFERENCES members(id) ON DELETE SET NULL,
      comment       TEXT NOT NULL CHECK (length(trim(comment)) > 0),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_task_submission_comments_submission_id ON task_submission_comments(submission_id);

    CREATE TABLE IF NOT EXISTS task_deadline_events (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id           UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      deadline          TIMESTAMPTZ NOT NULL,
      detected_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      phase             TEXT NOT NULL DEFAULT 'voting' CHECK (phase IN ('voting','proposing')),
      round             INT NOT NULL DEFAULT 1,
      resolved_at       TIMESTAMPTZ,
      resolution        TEXT CHECK (resolution IN ('extended','reassigned','dismissed','custom')),
      resolution_detail JSONB,
      resolved_by       UUID REFERENCES members(id) ON DELETE SET NULL,
      suggestions       JSONB NOT NULL DEFAULT '[]'::jsonb,
      CONSTRAINT task_deadline_events_resolution_consistency CHECK (
        (resolved_at IS NULL AND resolution IS NULL) OR
        (resolved_at IS NOT NULL AND resolution IS NOT NULL)
      )
    );
    CREATE INDEX IF NOT EXISTS idx_task_deadline_events_task_id_detected_at ON task_deadline_events(task_id, detected_at DESC);

    CREATE TABLE IF NOT EXISTS task_deadline_votes (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id       UUID NOT NULL REFERENCES task_deadline_events(id) ON DELETE CASCADE,
      member_id      UUID REFERENCES members(id) ON DELETE SET NULL,
      choice_key     TEXT NOT NULL,
      choice_payload JSONB NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS task_deadline_votes_uq
      ON task_deadline_votes (event_id, member_id) WHERE member_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS task_deadline_proposals (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id       UUID NOT NULL REFERENCES task_deadline_events(id) ON DELETE CASCADE,
      round          INT NOT NULL,
      proposed_by    UUID REFERENCES members(id) ON DELETE SET NULL,
      choice_key     TEXT NOT NULL,
      choice_payload JSONB NOT NULL,
      status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_task_deadline_proposals_event_id ON task_deadline_proposals(event_id, round DESC);

    CREATE TABLE IF NOT EXISTS task_deadline_proposal_responses (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      proposal_id  UUID NOT NULL REFERENCES task_deadline_proposals(id) ON DELETE CASCADE,
      member_id    UUID REFERENCES members(id) ON DELETE SET NULL,
      response     TEXT NOT NULL CHECK (response IN ('agree','disagree')),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS task_deadline_proposal_responses_uq
      ON task_deadline_proposal_responses (proposal_id, member_id) WHERE member_id IS NOT NULL;

    -- NOTE: historical row data for all of the above tables was permanently
    -- deleted by this migration's up() and cannot be restored.
  `)
}
