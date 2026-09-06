CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE plant_state AS ENUM ('thriving', 'healthy', 'struggling', 'wilting');

CREATE TABLE teams (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  join_code  CHAR(6) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE members (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id            UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  display_name       TEXT NOT NULL,
  joined_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  subject_responses  JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE individual_reflections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  component     TEXT NOT NULL CHECK (component IN ('object','division_of_labor','rules','tools','community')),
  response_data JSONB NOT NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(member_id, component)
);

CREATE TABLE reveal_ai (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE UNIQUE,
  per_component  JSONB NOT NULL,
  flagged_components TEXT[] NOT NULL DEFAULT '{}',
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE agreements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id           UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  component         TEXT NOT NULL CHECK (component IN ('object','division_of_labor','rules','tools','community')),
  resolution_note   TEXT,
  draft_text        TEXT,
  final_text        TEXT,
  recorded_by       UUID REFERENCES members(id),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, component)
);

CREATE TABLE agreement_approvals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  component   TEXT NOT NULL CHECK (component IN ('object','division_of_labor','rules','tools','community')),
  member_id   UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, component, member_id)
);

CREATE TABLE checkins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  cycle_number  SMALLINT NOT NULL CHECK (cycle_number IN (1, 2)),
  component     TEXT NOT NULL CHECK (component IN ('object','division_of_labor','rules','tools','community')),
  response_data JSONB NOT NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(member_id, cycle_number, component)
);

CREATE TABLE plant_states (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id            UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  cycle_number       SMALLINT NOT NULL CHECK (cycle_number IN (1, 2)),
  computed_state     plant_state NOT NULL,
  flagged_components TEXT[] NOT NULL DEFAULT '{}',
  ai_nudge_text      TEXT,
  computed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, cycle_number)
);

CREATE TABLE resolutions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  component       TEXT NOT NULL CHECK (component IN ('object','division_of_labor','rules','tools','community')),
  cycle_number    SMALLINT NOT NULL CHECK (cycle_number IN (1, 2)),
  resolution_note TEXT,
  resolved_by     UUID REFERENCES members(id),
  resolved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, component, cycle_number)
);
