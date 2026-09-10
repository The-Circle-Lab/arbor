import type { MigrationBuilder } from 'node-pg-migrate'

// 20260831000000000_shrink_chat_component_enum.ts dropped 'subject' as a
// valid component, leaving 5 possible distinct values instead of 6. The
// recompute_team_stage() trigger function from 20260824000000000_add_team_stage.ts
// still hardcoded '= 6' in its reflection/checkin/agreement completeness
// checks, so those checks could never be satisfied and teams.stage would get
// stuck. This redefines the function with the corrected count and re-runs
// the backfill so existing teams' stages reflect it immediately.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
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
      SELECT project_manager_id, plant_type, plant_votes
        INTO v_project_manager_id, v_plant_type, v_plant_votes
        FROM teams WHERE id = p_team_id FOR UPDATE;

      IF NOT FOUND THEN
        RETURN;
      END IF;

      SELECT COUNT(*) INTO v_team_size FROM members WHERE team_id = p_team_id;

      -- allReflected: every member has submitted all 5 reflection components.
      SELECT COUNT(*) INTO v_reflected_members FROM (
        SELECT ir.member_id
        FROM individual_reflections ir
        JOIN members m ON m.id = ir.member_id
        WHERE m.team_id = p_team_id
        GROUP BY ir.member_id
        HAVING COUNT(DISTINCT ir.component) = 5
      ) sub;

      SELECT EXISTS(SELECT 1 FROM reveal_ai WHERE team_id = p_team_id) INTO v_has_reveal;

      -- allAgreed: all 5 components have an agreements row, each approved by
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

      -- Check-in counts: members who submitted all 5 components for a cycle.
      SELECT COUNT(*) INTO v_checkin1 FROM (
        SELECT ci.member_id
        FROM checkins ci
        JOIN members m ON m.id = ci.member_id
        WHERE m.team_id = p_team_id AND ci.cycle_number = 1
        GROUP BY ci.member_id
        HAVING COUNT(DISTINCT ci.component) = 5
      ) sub;

      SELECT COUNT(*) INTO v_checkin2 FROM (
        SELECT ci.member_id
        FROM checkins ci
        JOIN members m ON m.id = ci.member_id
        WHERE m.team_id = p_team_id AND ci.cycle_number = 2
        GROUP BY ci.member_id
        HAVING COUNT(DISTINCT ci.component) = 5
      ) sub;

      SELECT flagged_components INTO v_flagged1 FROM plant_states WHERE team_id = p_team_id AND cycle_number = 1;
      SELECT flagged_components INTO v_flagged2 FROM plant_states WHERE team_id = p_team_id AND cycle_number = 2;

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

      v_stage := 0;

      IF v_project_manager_id IS NOT NULL AND v_plant_type IS NOT NULL AND v_plant_votes <> '{}'::jsonb THEN
        v_stage := 1;
      END IF;

      IF v_reflected_members >= v_team_size THEN
        v_stage := 2;
      END IF;

      IF v_reflected_members >= v_team_size AND v_has_reveal THEN
        v_stage := 3;
      END IF;

      IF v_agreement_components = 5 AND NOT v_agreement_unmet THEN
        v_stage := 4;
      END IF;

      IF v_agreement_components = 5 AND NOT v_agreement_unmet AND v_task_count > 0 AND v_task_approvals >= v_team_size THEN
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
      SELECT project_manager_id, plant_type, plant_votes
        INTO v_project_manager_id, v_plant_type, v_plant_votes
        FROM teams WHERE id = p_team_id FOR UPDATE;

      IF NOT FOUND THEN
        RETURN;
      END IF;

      SELECT COUNT(*) INTO v_team_size FROM members WHERE team_id = p_team_id;

      SELECT COUNT(*) INTO v_reflected_members FROM (
        SELECT ir.member_id
        FROM individual_reflections ir
        JOIN members m ON m.id = ir.member_id
        WHERE m.team_id = p_team_id
        GROUP BY ir.member_id
        HAVING COUNT(DISTINCT ir.component) = 6
      ) sub;

      SELECT EXISTS(SELECT 1 FROM reveal_ai WHERE team_id = p_team_id) INTO v_has_reveal;

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

      v_stage := 0;

      IF v_project_manager_id IS NOT NULL AND v_plant_type IS NOT NULL AND v_plant_votes <> '{}'::jsonb THEN
        v_stage := 1;
      END IF;

      IF v_reflected_members >= v_team_size THEN
        v_stage := 2;
      END IF;

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
