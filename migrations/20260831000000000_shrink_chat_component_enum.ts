import type { MigrationBuilder } from 'node-pg-migrate'

// Subject is removed as a shared CHAT-framework component: it no longer
// appears in reveal, agreements, or check-ins. Its three reflection
// questions are kept, but move to `members.subject_responses` (see the
// next migration) instead of `individual_reflections` keyed by
// component = 'subject'. No production data exists with component =
// 'subject' yet, so those rows are simply deleted rather than backfilled.
//
// Converts `chat_component` from an enum to TEXT + CHECK across the five
// tables that reference it, matching the precedent in
// 20260721000001000_fix_plant_state_enum.ts.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DELETE FROM individual_reflections WHERE component = 'subject';
    DELETE FROM agreements WHERE component = 'subject';
    DELETE FROM agreement_approvals WHERE component = 'subject';
    DELETE FROM checkins WHERE component = 'subject';
    DELETE FROM resolutions WHERE component = 'subject';

    UPDATE reveal_ai SET per_component = per_component - 'subject';
    UPDATE reveal_ai SET flagged_components = array_remove(flagged_components, 'subject');
    -- plant_states.flagged_components is a cached snapshot from a prior
    -- computePlantState() run (back when 'subject' was a checkin question),
    -- not a live join — it needs the same scrub as reveal_ai above.
    UPDATE plant_states SET flagged_components = array_remove(flagged_components, 'subject');

    ALTER TABLE individual_reflections ALTER COLUMN component TYPE TEXT;
    ALTER TABLE individual_reflections ADD CONSTRAINT individual_reflections_component_check
      CHECK (component IN ('object','division_of_labor','rules','tools','community'));

    ALTER TABLE agreements ALTER COLUMN component TYPE TEXT;
    ALTER TABLE agreements ADD CONSTRAINT agreements_component_check
      CHECK (component IN ('object','division_of_labor','rules','tools','community'));

    ALTER TABLE agreement_approvals ALTER COLUMN component TYPE TEXT;
    ALTER TABLE agreement_approvals ADD CONSTRAINT agreement_approvals_component_check
      CHECK (component IN ('object','division_of_labor','rules','tools','community'));

    ALTER TABLE checkins ALTER COLUMN component TYPE TEXT;
    ALTER TABLE checkins ADD CONSTRAINT checkins_component_check
      CHECK (component IN ('object','division_of_labor','rules','tools','community'));

    ALTER TABLE resolutions ALTER COLUMN component TYPE TEXT;
    ALTER TABLE resolutions ADD CONSTRAINT resolutions_component_check
      CHECK (component IN ('object','division_of_labor','rules','tools','community'));

    DROP TYPE IF EXISTS chat_component;
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TYPE chat_component AS ENUM (
      'object',
      'subject',
      'division_of_labor',
      'rules',
      'tools',
      'community'
    );

    ALTER TABLE individual_reflections DROP CONSTRAINT IF EXISTS individual_reflections_component_check;
    ALTER TABLE individual_reflections ALTER COLUMN component TYPE chat_component USING component::chat_component;

    ALTER TABLE agreements DROP CONSTRAINT IF EXISTS agreements_component_check;
    ALTER TABLE agreements ALTER COLUMN component TYPE chat_component USING component::chat_component;

    ALTER TABLE agreement_approvals DROP CONSTRAINT IF EXISTS agreement_approvals_component_check;
    ALTER TABLE agreement_approvals ALTER COLUMN component TYPE chat_component USING component::chat_component;

    ALTER TABLE checkins DROP CONSTRAINT IF EXISTS checkins_component_check;
    ALTER TABLE checkins ALTER COLUMN component TYPE chat_component USING component::chat_component;

    ALTER TABLE resolutions DROP CONSTRAINT IF EXISTS resolutions_component_check;
    ALTER TABLE resolutions ALTER COLUMN component TYPE chat_component USING component::chat_component;
  `)
  // Deleted 'subject' rows (and the stripped reveal_ai keys) are not
  // recoverable — expected, since no production data existed for them.
}
