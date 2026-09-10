import type { MigrationBuilder } from 'node-pg-migrate'

// Append-only audit ledger for the CHAT reveal/agree/check-in flow, same
// "ledger table with a source discriminator + free-form detail" convention
// as plant_health_events (20260721000000000_add_final_report_support.ts).
// One row per notable event, scoped by team/component/cycle where those
// apply — `component`/`cycle_number`/`member_id` are all nullable since a
// few sources (engagement_level_computed) are team-level facts rather than
// something that happened to one component in one cycle.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE component_flow_events (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id      UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      component    TEXT CHECK (component IN ('object','division_of_labor','rules','tools','community')),
      cycle_number SMALLINT CHECK (cycle_number IN (0, 1, 2)),
      member_id    UUID REFERENCES members(id) ON DELETE SET NULL,
      source       TEXT NOT NULL CHECK (source IN (
        'engagement_level_computed',
        'facilitation_instruction_fired',
        'submission_step_summary',
        'resolution_rejected',
        'regeneration_cap_hit',
        'member_skipped',
        'component_resolved',
        'clause_authored'
      )),
      detail       JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_component_flow_events_team_occurred_at ON component_flow_events(team_id, occurred_at);
    CREATE INDEX idx_component_flow_events_team_component_cycle ON component_flow_events(team_id, component, cycle_number);
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE IF EXISTS component_flow_events CASCADE;
  `)
}
