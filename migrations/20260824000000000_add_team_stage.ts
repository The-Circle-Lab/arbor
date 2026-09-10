import type { MigrationBuilder } from 'node-pg-migrate'
// Stage numbering:
//   0 TEAM_CREATION        4 TASKS       8 PLANT_2
//   1 INDIVIDUAL_REFLECTION 5 CHECKIN_1  9 DONE
//   2 REVEAL                6 PLANT_1
//   3 AGREEING              7 CHECKIN_2

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE teams ADD COLUMN IF NOT EXISTS stage SMALLINT NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 9);

    CREATE OR REPLACE FUNCTION recompute_team_stage(p_team_id uuid) RETURNS void AS $body$
    DECLARE
      v_team_size            int;
      v_project_manager_id   uuid;
      v_plant_type           text;
      v_plant_votes          jsonb;
      v_reflected_members    int;
      v_has_reveal           boolean;
      v_agreement_components int;
      v_agreement_unmet      boolean;
      v_task_count           int;
      v_task_approvals       int;
      v_checkin1             int;
      v_checkin2             int;
      v_flagged1             text[];
      v_flagged2             text[];
      v_plant1_unresolved    boolean;
      v_plant2_unresolved    boolean;
      v_stage                smallint;
    BEGIN
      -- Lock the team row for the duration of the recompute so concurrent
      -- writes to different source tables for the same team serialize
      -- instead of racing to a stale UPDATE.
      SELECT project_manager_id, plant_type, plant_votes
        INTO v_project_manager_id, v_plant_type, v_plant_votes
        FROM teams WHERE id = p_team_id FOR UPDATE;

      IF NOT FOUND THEN
        RETURN;
      END IF;

      SELECT COUNT(*) INTO v_team_size FROM members WHERE team_id = p_team_id;

      -- allReflected: every member has submitted all 6 reflection components.
      SELECT COUNT(*) INTO v_reflected_members FROM (
        SELECT ir.member_id
        FROM individual_reflections ir
        JOIN members m ON m.id = ir.member_id
        WHERE m.team_id = p_team_id
        GROUP BY ir.member_id
        HAVING COUNT(DISTINCT ir.component) = 6
      ) sub;

      SELECT EXISTS(SELECT 1 FROM reveal_ai WHERE team_id = p_team_id) INTO v_has_reveal;

      -- allAgreed: all 6 components have an agreements row, each approved by
      -- every member.
      SELECT COUNT(*) INTO v_agreement_components FROM agreements WHERE team_id = p_team_id;
      SELECT EXISTS (
        SELECT 1 FROM agreements ag
        WHERE ag.team_id = p_team_id
        AND (
          SELECT COUNT(*) FROM agreement_approvals aa
          WHERE aa.team_id = ag.team_id AND aa.component = ag.component
        ) < v_team_size
      ) INTO v_agreement_unmet;

      SELECT COUNT(*) INTO v_task_count FROM tasks WHERE team_id = p_team_id;
      SELECT COUNT(*) INTO v_task_approvals FROM task_approvals WHERE team_id = p_team_id;

      -- Check-in counts: members who submitted all 6 components for a cycle.
      SELECT COUNT(*) INTO v_checkin1 FROM (
        SELECT ci.member_id
        FROM checkins ci
        JOIN members m ON m.id = ci.member_id
        WHERE m.team_id = p_team_id AND ci.cycle_number = 1
        GROUP BY ci.member_id
        HAVING COUNT(DISTINCT ci.component) = 6
      ) sub;

      SELECT COUNT(*) INTO v_checkin2 FROM (
        SELECT ci.member_id
        FROM checkins ci
        JOIN members m ON m.id = ci.member_id
        WHERE m.team_id = p_team_id AND ci.cycle_number = 2
        GROUP BY ci.member_id
        HAVING COUNT(DISTINCT ci.component) = 6
      ) sub;

      SELECT flagged_components INTO v_flagged1 FROM plant_states WHERE team_id = p_team_id AND cycle_number = 1;
      SELECT flagged_components INTO v_flagged2 FROM plant_states WHERE team_id = p_team_id AND cycle_number = 2;

      -- A cycle is resolved when it flagged nothing, or every flagged
      -- component has been re-approved by every member.
      SELECT EXISTS (
        SELECT 1 FROM unnest(COALESCE(v_flagged1, '{}')) AS fc
        WHERE (
          SELECT COUNT(*) FROM agreement_approvals aa
          WHERE aa.team_id = p_team_id AND aa.component::text = fc
        ) < v_team_size
      ) INTO v_plant1_unresolved;

      SELECT EXISTS (
        SELECT 1 FROM unnest(COALESCE(v_flagged2, '{}')) AS fc
        WHERE (
          SELECT COUNT(*) FROM agreement_approvals aa
          WHERE aa.team_id = p_team_id AND aa.component::text = fc
        ) < v_team_size
      ) INTO v_plant2_unresolved;

      -- Each condition below is evaluated independently (not chained off the
      -- previous one) and, when true, overrides v_stage outright — same
      -- semantics as phase.ts's if-ladder, which is what makes a growing
      -- team_size (a new member joining) correctly fall the stage back to
      -- wherever the newcomer hasn't caught up yet.
      v_stage := 0;

      IF v_project_manager_id IS NOT NULL AND v_plant_type IS NOT NULL AND v_plant_votes <> '{}'::jsonb THEN
        v_stage := 1;
      END IF;

      IF v_reflected_members >= v_team_size THEN
        v_stage := 2;
      END IF;

      -- v_has_reveal is a one-time team-level fact (unlike every other gate
      -- here, it isn't a live per-member count), so on its own it would never
      -- regress when a new member joins mid-team. Conjoining it with the
      -- stage-2 condition keeps it participating in the same "growing
      -- team_size pulls the stage back" behavior as everything else.
      IF v_reflected_members >= v_team_size AND v_has_reveal THEN
        v_stage := 3;
      END IF;

      IF v_agreement_components = 6 AND NOT v_agreement_unmet THEN
        v_stage := 4;
      END IF;

      IF v_agreement_components = 6 AND NOT v_agreement_unmet AND v_task_count > 0 AND v_task_approvals >= v_team_size THEN
        v_stage := 5;
      END IF;

      IF v_checkin1 >= v_team_size THEN
        v_stage := 6;
      END IF;

      IF v_checkin1 >= v_team_size AND NOT v_plant1_unresolved THEN
        v_stage := 7;
      END IF;

      IF v_checkin2 >= v_team_size THEN
        v_stage := 8;
      END IF;

      IF v_checkin2 >= v_team_size AND NOT v_plant2_unresolved THEN
        v_stage := 9;
      END IF;

      UPDATE teams SET stage = v_stage WHERE id = p_team_id AND stage IS DISTINCT FROM v_stage;
    END;
    $body$ LANGUAGE plpgsql;

    -- Trigger wrapper for tables that carry team_id directly.
    CREATE OR REPLACE FUNCTION trg_recompute_stage_by_team_id() RETURNS trigger AS $body$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        PERFORM recompute_team_stage(OLD.team_id);
      ELSE
        PERFORM recompute_team_stage(NEW.team_id);
      END IF;
      RETURN NULL;
    END;
    $body$ LANGUAGE plpgsql;

    -- Trigger wrapper for tables that only carry member_id.
    CREATE OR REPLACE FUNCTION trg_recompute_stage_by_member_id() RETURNS trigger AS $body$
    DECLARE
      v_team_id uuid;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        SELECT team_id INTO v_team_id FROM members WHERE id = OLD.member_id;
      ELSE
        SELECT team_id INTO v_team_id FROM members WHERE id = NEW.member_id;
      END IF;
      IF v_team_id IS NOT NULL THEN
        PERFORM recompute_team_stage(v_team_id);
      END IF;
      RETURN NULL;
    END;
    $body$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION trg_recompute_stage_on_teams_update() RETURNS trigger AS $body$
    BEGIN
      PERFORM recompute_team_stage(NEW.id);
      RETURN NULL;
    END;
    $body$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS teams_stage_recompute ON teams;
    CREATE TRIGGER teams_stage_recompute
      AFTER UPDATE OF project_manager_id, plant_type, plant_votes ON teams
      FOR EACH ROW
      WHEN (
        NEW.project_manager_id IS DISTINCT FROM OLD.project_manager_id
        OR NEW.plant_type IS DISTINCT FROM OLD.plant_type
        OR NEW.plant_votes IS DISTINCT FROM OLD.plant_votes
      )
      EXECUTE FUNCTION trg_recompute_stage_on_teams_update();

    DROP TRIGGER IF EXISTS individual_reflections_stage_recompute ON individual_reflections;
    CREATE TRIGGER individual_reflections_stage_recompute
      AFTER INSERT ON individual_reflections
      FOR EACH ROW EXECUTE FUNCTION trg_recompute_stage_by_member_id();

    DROP TRIGGER IF EXISTS reveal_ai_stage_recompute ON reveal_ai;
    CREATE TRIGGER reveal_ai_stage_recompute
      AFTER INSERT ON reveal_ai
      FOR EACH ROW EXECUTE FUNCTION trg_recompute_stage_by_team_id();

    DROP TRIGGER IF EXISTS agreements_stage_recompute ON agreements;
    CREATE TRIGGER agreements_stage_recompute
      AFTER INSERT OR DELETE ON agreements
      FOR EACH ROW EXECUTE FUNCTION trg_recompute_stage_by_team_id();

    DROP TRIGGER IF EXISTS agreement_approvals_stage_recompute ON agreement_approvals;
    CREATE TRIGGER agreement_approvals_stage_recompute
      AFTER INSERT OR DELETE ON agreement_approvals
      FOR EACH ROW EXECUTE FUNCTION trg_recompute_stage_by_team_id();

    DROP TRIGGER IF EXISTS tasks_stage_recompute ON tasks;
    CREATE TRIGGER tasks_stage_recompute
      AFTER INSERT OR DELETE ON tasks
      FOR EACH ROW EXECUTE FUNCTION trg_recompute_stage_by_team_id();

    DROP TRIGGER IF EXISTS task_approvals_stage_recompute ON task_approvals;
    CREATE TRIGGER task_approvals_stage_recompute
      AFTER INSERT OR DELETE ON task_approvals
      FOR EACH ROW EXECUTE FUNCTION trg_recompute_stage_by_team_id();

    DROP TRIGGER IF EXISTS checkins_stage_recompute ON checkins;
    CREATE TRIGGER checkins_stage_recompute
      AFTER INSERT OR UPDATE ON checkins
      FOR EACH ROW EXECUTE FUNCTION trg_recompute_stage_by_member_id();

    DROP TRIGGER IF EXISTS plant_states_stage_recompute ON plant_states;
    CREATE TRIGGER plant_states_stage_recompute
      AFTER INSERT OR UPDATE ON plant_states
      FOR EACH ROW EXECUTE FUNCTION trg_recompute_stage_by_team_id();

    DROP TRIGGER IF EXISTS members_stage_recompute ON members;
    CREATE TRIGGER members_stage_recompute
      AFTER INSERT ON members
      FOR EACH ROW EXECUTE FUNCTION trg_recompute_stage_by_team_id();

    -- Backfill: existing teams should reflect their real progress
    -- immediately, not sit at the default 0 until their next write.
    DO $backfill$
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN SELECT id FROM teams LOOP
        PERFORM recompute_team_stage(r.id);
      END LOOP;
    END;
    $backfill$;
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TRIGGER IF EXISTS members_stage_recompute ON members;
    DROP TRIGGER IF EXISTS plant_states_stage_recompute ON plant_states;
    DROP TRIGGER IF EXISTS checkins_stage_recompute ON checkins;
    DROP TRIGGER IF EXISTS task_approvals_stage_recompute ON task_approvals;
    DROP TRIGGER IF EXISTS tasks_stage_recompute ON tasks;
    DROP TRIGGER IF EXISTS agreement_approvals_stage_recompute ON agreement_approvals;
    DROP TRIGGER IF EXISTS agreements_stage_recompute ON agreements;
    DROP TRIGGER IF EXISTS reveal_ai_stage_recompute ON reveal_ai;
    DROP TRIGGER IF EXISTS individual_reflections_stage_recompute ON individual_reflections;
    DROP TRIGGER IF EXISTS teams_stage_recompute ON teams;

    DROP FUNCTION IF EXISTS trg_recompute_stage_on_teams_update();
    DROP FUNCTION IF EXISTS trg_recompute_stage_by_member_id();
    DROP FUNCTION IF EXISTS trg_recompute_stage_by_team_id();
    DROP FUNCTION IF EXISTS recompute_team_stage(uuid);

    ALTER TABLE teams DROP COLUMN IF EXISTS stage;
  `)
}
