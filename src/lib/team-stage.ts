// Numeric team stage — the value stored in teams.stage and maintained by the
// DB triggers in the add_team_stage migration (recompute_team_stage()).
// Kept in its own module (no other imports) so client components can import
// these constants without pulling in phase.ts's server-only db.ts import.
export const TEAM_CREATION = 0
export const INDIVIDUAL_REFLECTION = 1
export const REVEAL = 2
export const AGREEING = 3
export const CHECKIN_1 = 5
export const PLANT_1 = 6
export const CHECKIN_2 = 7
export const PLANT_2 = 8
export const DONE = 9

export const STAGE_LABELS: Record<number, string> = {
  [TEAM_CREATION]: 'Setting up the team',
  [INDIVIDUAL_REFLECTION]: 'Reflecting individually',
  [REVEAL]: 'Comparing reflections',
  [AGREEING]: 'Writing team agreement',
  [CHECKIN_1]: 'Check-in 1',
  [PLANT_1]: 'Reviewing check-in 1',
  [CHECKIN_2]: 'Check-in 2',
  [PLANT_2]: 'Reviewing check-in 2',
  [DONE]: 'Done',
}
