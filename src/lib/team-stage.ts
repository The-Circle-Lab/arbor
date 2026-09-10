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

// The label wording intentionally doesn't mirror the constant names above:
// CHECKIN_1/PLANT_1/CHECKIN_2 are reached as soon as the *previous* step
// finishes and the next one hasn't started yet (see recompute_team_stage()
// in migrations/20260910010002000_recompute_team_stage_drop_tasks.ts), so
// e.g. stage CHECKIN_1 means "agreement done, check-in 1 not started" and
// stage PLANT_1/CHECKIN_2 both mean "check-in 1 done, check-in 2 not
// started" (whether or not its flagged tension has been resolved yet).
export const STAGE_LABELS: Record<number, string> = {
  [TEAM_CREATION]: 'Setting up the team',
  [INDIVIDUAL_REFLECTION]: 'Reflecting individually',
  [REVEAL]: 'Comparing reflections',
  [AGREEING]: 'Writing team agreement',
  [CHECKIN_1]: 'Agreement done',
  [PLANT_1]: 'Check-in 1 done',
  [CHECKIN_2]: 'Check-in 1 done',
  [PLANT_2]: 'Reviewing check-in 2',
  [DONE]: 'Done',
}
