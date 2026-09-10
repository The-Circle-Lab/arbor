import type { MigrationBuilder } from 'node-pg-migrate'

// HIGH-engagement-level flagged components replace the resolutionNote/draft/
// approve UI with a 3-stage flow: (1) misalignment_submissions — private
// per-member submit-or-skip, gated like individual_reflections (block until
// everyone's acted); (2) the anonymized reveal is computed live from
// misalignment_submissions (status='submitted', ORDER BY id — a random UUID
// unrelated to submission timing, so listing order never leaks who went
// first — no extra shuffle step or table needed); (3) misalignment_resolutions
// holds the current AI-drafted (or, after two rejections, manually-written)
// clause plus a round counter, misalignment_resolution_votes holds one row
// per member per round so bumping `round` on reject/manual-edit reopens
// approval for everyone without deleting rows (contrast agreement_approvals,
// which deletes on reopen since it has no round concept).
//
// Resolution still finalizes into the existing agreements/agreement_approvals
// tables (final_text + one row per member), so phase.ts's allAgreed, the
// recompute_team_stage trigger, and agree/page.tsx's getStatus() need zero
// changes. The new `via` column on agreement_approvals is purely
// informational — every COUNT(*) those three readers run is unaffected by
// its value; it only lets the UI show "skipped" distinctly from a genuine
// approval.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE agreement_approvals
      ADD COLUMN IF NOT EXISTS via TEXT NOT NULL DEFAULT 'approved' CHECK (via IN ('approved', 'skipped'));

    CREATE TABLE IF NOT EXISTS misalignment_submissions (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id      UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      component    TEXT NOT NULL CHECK (component IN ('object','division_of_labor','rules','tools','community')),
      cycle_number SMALLINT NOT NULL DEFAULT 0 CHECK (cycle_number IN (0, 1, 2)),
      member_id    UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      status       TEXT NOT NULL CHECK (status IN ('submitted', 'skipped')),
      content      TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT misalignment_submissions_content_shape CHECK (
        (status = 'skipped' AND content IS NULL) OR
        (status = 'submitted' AND content IS NOT NULL AND length(trim(content)) > 0)
      )
    );
    CREATE UNIQUE INDEX IF NOT EXISTS misalignment_submissions_uq
      ON misalignment_submissions (team_id, component, cycle_number, member_id);

    CREATE TABLE IF NOT EXISTS misalignment_resolutions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      component     TEXT NOT NULL CHECK (component IN ('object','division_of_labor','rules','tools','community')),
      cycle_number  SMALLINT NOT NULL DEFAULT 0 CHECK (cycle_number IN (0, 1, 2)),
      round         INT NOT NULL DEFAULT 1,
      reject_count  INT NOT NULL DEFAULT 0 CHECK (reject_count BETWEEN 0 AND 2),
      manual_mode   BOOLEAN NOT NULL DEFAULT false,
      draft_text    TEXT,
      resolved_at   TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS misalignment_resolutions_uq
      ON misalignment_resolutions (team_id, component, cycle_number);

    -- No cycle_number here: scoped via resolution_id, whose parent row
    -- already carries cycle_number — adding it here too would be redundant.
    CREATE TABLE IF NOT EXISTS misalignment_resolution_votes (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      resolution_id  UUID NOT NULL REFERENCES misalignment_resolutions(id) ON DELETE CASCADE,
      round          INT NOT NULL,
      member_id      UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      vote           TEXT NOT NULL CHECK (vote IN ('approve', 'reject')),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS misalignment_resolution_votes_uq
      ON misalignment_resolution_votes (resolution_id, round, member_id);
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE IF EXISTS misalignment_resolution_votes CASCADE;
    DROP TABLE IF EXISTS misalignment_resolutions CASCADE;
    DROP TABLE IF EXISTS misalignment_submissions CASCADE;
    ALTER TABLE agreement_approvals DROP COLUMN IF EXISTS via;
  `)
}
