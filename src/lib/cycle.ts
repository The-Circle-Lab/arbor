// Validates the `[cycle]` route param used by instructor team endpoints
// (tension/[cycle], summary/[cycle]) — only cycles 1 and 2 exist today.
export function isValidCycle(cycle: string): boolean {
  return cycle === '1' || cycle === '2'
}
