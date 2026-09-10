import { query } from './db'
import { ChatComponent } from './chat-components'

// Single owning module for agreement_approvals — every route that reads,
// records, or invalidates a component's approval goes through here instead
// of hand-writing the same queries.

export interface AgreementApproval {
  component: string
  member_id: string
}

export async function listAgreementApprovals(teamId: string): Promise<AgreementApproval[]> {
  return query<AgreementApproval>(
    'SELECT component, member_id FROM agreement_approvals WHERE team_id = $1',
    [teamId]
  )
}

// Accepts one component (an edit to that component's text) or several (a
// check-in cycle re-flagging multiple components at once) — a no-op list
// clears nothing rather than issuing a DELETE ... = ANY('{}').
export async function clearAgreementApprovals(teamId: string, components: ChatComponent | ChatComponent[]): Promise<void> {
  const list = Array.isArray(components) ? components : [components]
  if (list.length === 0) return
  await query('DELETE FROM agreement_approvals WHERE team_id = $1 AND component = ANY($2)', [teamId, list])
}

export async function recordAgreementApproval(teamId: string, component: ChatComponent, memberId: string): Promise<void> {
  await query(
    `INSERT INTO agreement_approvals (team_id, component, member_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (team_id, component, member_id) DO NOTHING`,
    [teamId, component, memberId]
  )
}

export async function withdrawAgreementApproval(teamId: string, component: ChatComponent, memberId: string): Promise<void> {
  await query(
    'DELETE FROM agreement_approvals WHERE team_id = $1 AND component = $2 AND member_id = $3',
    [teamId, component, memberId]
  )
}
