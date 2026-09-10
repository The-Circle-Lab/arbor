import { CHAT_COMPONENTS, ChatComponent, COMPONENT_LABELS } from './chat-components'
import { sendAiApiRequest } from './ai-api'

interface ComponentAnalysisResponse {
  components: Record<ChatComponent, { comment: string; flagged: boolean }>
}

const componentAnalysisSchema = {
  type: 'object',
  properties: {
    components: {
      type: 'object',
      properties: Object.fromEntries(CHAT_COMPONENTS.map(c => [c, {
        type: 'object',
        properties: {
          comment: { type: 'string' },
          flagged: { type: 'boolean' },
        },
        required: ['comment', 'flagged'],
        additionalProperties: false,
      }])),
      required: [...CHAT_COMPONENTS],
      additionalProperties: false,
    },
  },
  required: ['components'],
  additionalProperties: false,
}

const agreementSchema = {
  type: 'object',
  properties: {
    agreement: { type: 'string' },
  },
  required: ['agreement'],
  additionalProperties: false,
}

const nudgeSchema = {
  type: 'object',
  properties: {
    flagged_components: { type: 'array', items: { type: 'string', enum: [...CHAT_COMPONENTS] } },
    nudge_bullets: { type: 'array', items: { type: 'string' } },
  },
  required: ['flagged_components', 'nudge_bullets'],
  additionalProperties: false,
}

// The model still sees which member wrote what — it needs that to detect divergence
// at all — but the commentary it produces is about the team, not about individuals.
// Counts are banned alongside names: on a 3-person team "one member disagrees" plus a
// reveal page that lists every answer under its author is an identification.
const NO_MEMBER_ATTRIBUTION_RULE = `Hard requirement: never write the words "one member", "another member", "a member", "one of them", "someone on the team", "the first member", "Member 1", "two of them", "most of the team", or "only one person" anywhere in your output — not even as part of a sentence that also states agreement, drift, or tension. Write about the team, never about individuals. Never identify anyone, even indirectly: no names, no initials, no counts of how many people hold a view. Do not order or phrase things so a position can be traced back to whoever wrote it.

This applies even when a name appears directly in what you were given — a reflection, an agreement, or a check-in note. If the agreement text itself says "We agreed Priya leads structure," do not repeat "Priya" back; describe the role or responsibility instead. Never copy a name forward from your input into your output.

Write about the positions instead of the people holding them. Name the expectations that are in play and how they differ. Rewrite attributions like these:
- "One member wants daily standups, another wants milestone-only syncs" → "Two different expectations on cadence are in play: daily standups versus syncing only at milestones."
- "One member aims to improve their writing, another to manage their time" → "The personal goals in play range from sharpening academic writing, to protecting time, to practising collaboration."
- "Most members report this as aligned, but one member reports it as slightly off" → "This is reported as aligned overall, with drift on one point."
- "One member reports that the cadence expectation was never settled" → "The cadence expectation was never settled and remains unresolved."
- "We agreed Priya leads structure, Dan handles research, and Wole handles editing" → "The team agreed on distinct roles across structure, research, and editing."

When the team does agree, say so about the team as a whole.`

export interface MemberReflection {
  displayName: string
  responses: Record<ChatComponent, Record<string, unknown>>
}

export interface RevealAIResult {
  perComponent: Record<ChatComponent, string>
  flaggedComponents: ChatComponent[]
}

// Shared by generateRevealComparison and generateCheckinComparison — both ask
// the model to analyze all five CHAT components in one call (componentAnalysisSchema
// requires every key), then split that into a per-component comment map plus
// the flagged subset.
function splitComponentAnalysis(components: ComponentAnalysisResponse['components']): {
  perComponent: Record<ChatComponent, string>
  flaggedComponents: ChatComponent[]
} {
  return {
    perComponent: {
      object: components.object.comment,
      division_of_labor: components.division_of_labor.comment,
      rules: components.rules.comment,
      tools: components.tools.comment,
      community: components.community.comment,
    },
    flaggedComponents: CHAT_COMPONENTS.filter(c => components[c].flagged),
  }
}

export async function generateRevealComparison(members: MemberReflection[], projectContext?: string): Promise<RevealAIResult> {
  const memberSummaries = members.map(m => {
    const sections = CHAT_COMPONENTS.map(comp =>
      `[${COMPONENT_LABELS[comp]}]\n${JSON.stringify(m.responses[comp], null, 2)}`
    ).join('\n\n')
    return `=== ${m.displayName} ===\n${sections}`
  }).join('\n\n')

  const contextSection = projectContext
    ? `\nProject context: ${projectContext}\n`
    : ''

  const prompt = `You are analyzing a student team's individual reflections using CHAT (Cultural-Historical Activity Theory).
${contextSection}
The team has ${members.length} members. Their individual reflections across five CHAT components are below.

${memberSummaries}

For each of the five CHAT components (object, division_of_labor, rules, tools, community), do two things:
1. Write a 2-3 sentence plain-language comment on where the team aligns or where a gap exists. Name the CHAT component explicitly. Do not tell the team what to do — only name the gap or alignment. No jargon beyond the component name itself. Write it about the team as a whole, following the attribution rule below.
2. Decide if this component should be FLAGGED (true/false). Flag it if there is a meaningful gap or potential misalignment that the team should discuss before proceeding.

${NO_MEMBER_ATTRIBUTION_RULE}`

  const message = await sendAiApiRequest<ComponentAnalysisResponse>('fast_model', 1500, prompt, componentAnalysisSchema)

  return splitComponentAnalysis(message.components)
}

export async function generateAgreementDraft(
  component: ChatComponent,
  memberResponses: MemberReflection[],
  resolutionNote?: string
): Promise<string> {
  const responseText = memberResponses.map(m => {
    const data = m.responses[component]
    return `${m.displayName}: ${JSON.stringify(data)}`
  }).join('\n')

  const resolutionSection = resolutionNote
    ? `\nAfter discussion, the team noted: "${resolutionNote}"`
    : ''

  const prompt = `You are helping a student team draft a group agreement for one component of their activity system.

CHAT Component: ${COMPONENT_LABELS[component]}

Individual reflections:
${responseText}${resolutionSection}

Draft a 1-2 sentence group agreement in first-person plural (starting with "We...") that captures what this team has decided about ${COMPONENT_LABELS[component]}. Plain language, no jargon. Be specific to what they actually wrote — do not add things they didn't say.`

  const message = await sendAiApiRequest<{ agreement: string }>('default_model', 300, prompt, agreementSchema)

  return message.agreement
}

export async function reviseAgreement(
  component: ChatComponent,
  currentAgreement: string,
  resolutionNote: string,
): Promise<string> {
  const prompt = `A student team is updating one group agreement after a check-in revealed tension.

CHAT Component: ${COMPONENT_LABELS[component]}

Their current agreement:
"${currentAgreement}"

After discussing the tension, the team noted:
"${resolutionNote}"

Rewrite the agreement as 1-2 sentences in first-person plural (starting with "We...") so it reflects what the team has now decided. Keep what still holds from the current agreement and fold in the new decision. Plain language, no jargon. Be specific to what they actually wrote — do not add things they didn't say.`

  const message = await sendAiApiRequest<{ agreement: string }>('default_model', 300, prompt, agreementSchema)

  return message.agreement
}

export interface CheckinSummary {
  displayName: string
  checkins: Partial<Record<ChatComponent, { rating?: string; notes?: Record<string, string> }>>
}

export interface CheckinComparisonResult {
  perComponent: Record<ChatComponent, string>
  flaggedComponents: ChatComponent[]
}

export async function generateCheckinComparison(
  members: CheckinSummary[],
  agreements: Partial<Record<ChatComponent, string>>,
  cycleNumber: number,
): Promise<CheckinComparisonResult> {
  // Presence check, not truthiness — an agreement explicitly cleared to an
  // empty string is still a row that exists and should still be listed,
  // distinct from a component that was never agreed on at all.
  const agreementText = CHAT_COMPONENTS
    .filter(c => agreements[c] !== undefined)
    .map(c => `${COMPONENT_LABELS[c]}: ${agreements[c]}`)
    .join('\n')

  const checkinText = members.map(m => {
    const lines = CHAT_COMPONENTS.map(comp => {
      const data = m.checkins[comp]
      const r = data?.rating ?? 'no rating'
      const notes = data?.notes ? Object.entries(data.notes).map(([k, v]) => `  ${k}: ${v}`).join('\n') : ''
      return `  ${COMPONENT_LABELS[comp]}: ${r}${notes ? '\n' + notes : ''}`
    }).join('\n')
    return `=== ${m.displayName} ===\n${lines}`
  }).join('\n\n')

  const prompt = `You are analyzing a student team's check-in (cycle ${cycleNumber}) using CHAT (Cultural-Historical Activity Theory).

Their original group agreements:
${agreementText}

Their check-in responses:
${checkinText}

For each of the five CHAT components (object, division_of_labor, rules, tools, community), do two things:
1. Write a 2-3 sentence plain-language comment on whether the team is holding to what they agreed, or where tension has appeared since. Reference the original agreement vs. what the team now reports. Name the CHAT component. Do not tell the team what to do — only name the gap or the alignment. No jargon beyond the component name. Write it about the team as a whole, following the attribution rule below.
2. Decide if this component should be FLAGGED (true/false). Flag it if there is a "very_off" rating, a divergence between members, or drift from the original agreement that the team should discuss.

${NO_MEMBER_ATTRIBUTION_RULE}`

  const message = await sendAiApiRequest<ComponentAnalysisResponse>('fast_model', 1500, prompt, componentAnalysisSchema)

  return splitComponentAnalysis(message.components)
}

export interface NudgeResult {
  flaggedComponents: ChatComponent[]
  nudgeBullets: string[]
}

export async function generateCheckinNudge(
  members: CheckinSummary[],
  agreements: Partial<Record<ChatComponent, string>>,
  cycleNumber: number
): Promise<NudgeResult> {
  // Presence check, not truthiness — an agreement explicitly cleared to an
  // empty string is still a row that exists and should still be listed,
  // distinct from a component that was never agreed on at all.
  const agreementText = CHAT_COMPONENTS
    .filter(c => agreements[c] !== undefined)
    .map(c => `${COMPONENT_LABELS[c]}: ${agreements[c]}`)
    .join('\n')

  const checkinText = members.map(m => {
    const lines = CHAT_COMPONENTS.map(comp => {
      const data = m.checkins[comp]
      const r = data?.rating ?? 'no rating'
      const notes = data?.notes ? Object.entries(data.notes).map(([k, v]) => `  ${k}: ${v}`).join('\n') : ''
      return `  ${COMPONENT_LABELS[comp]}: ${r}${notes ? '\n' + notes : ''}`
    }).join('\n')
    return `${m.displayName}:\n${lines}`
  }).join('\n\n')

  const prompt = `You are a collaborative learning coach using CHAT (Cultural-Historical Activity Theory). A student team is in check-in cycle ${cycleNumber}.

Their original group agreements:
${agreementText}

Their check-in responses:
${checkinText}

Identify which CHAT components show tension — any "very_off" rating, OR divergence between members' ratings for the same component (one says aligned, another says very_off).

Then write 2-4 short nudge bullets naming specific gaps without blame. Reference what was originally agreed vs. what members are now reporting. Do not tell them what to do. Each bullet is one plain sentence.

${NO_MEMBER_ATTRIBUTION_RULE}`

  const message = await sendAiApiRequest<{ flagged_components: ChatComponent[]; nudge_bullets: string[] }>('fast_model', 500, prompt, nudgeSchema)

  return {
    flaggedComponents: message.flagged_components,
    nudgeBullets: message.nudge_bullets,
  }
}

const instructorSummarySchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    watch_points: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'watch_points'],
  additionalProperties: false,
}

export interface InstructorSummaryResult {
  summary: string
  watchPoints: string[]
}

// Synthesizes the already-generated per-component prose (from
// generateCheckinComparison) into a short instructor-facing read, rather
// than re-deriving anything from raw check-in data itself.
export async function generateInstructorCheckinSummary(
  teamContext: { projectTitle: string | null },
  cycleNumber: number,
  flaggedComponents: ChatComponent[],
  perComponent: Record<ChatComponent, string>,
): Promise<InstructorSummaryResult> {
  const projectSection = teamContext.projectTitle ? `Project: ${teamContext.projectTitle}\n` : ''

  const componentSection = CHAT_COMPONENTS
    .map(c => `${COMPONENT_LABELS[c]}${flaggedComponents.includes(c) ? ' (flagged)' : ''}: ${perComponent[c] ?? 'No note available.'}`)
    .join('\n')

  const prompt = `You are writing a short instructor-facing read of a student team's check-in (cycle ${cycleNumber}), using CHAT (Cultural-Historical Activity Theory).
${projectSection}
Per-component analysis already generated for this team:
${componentSection}

Write a short plain-language paragraph (3-4 sentences) summarizing how this team is doing overall, for an instructor scanning many teams quickly. Then list up to 3 short "watch point" bullets naming the most important things this instructor should keep an eye on — based only on what's flagged above. If nothing is flagged, return an empty watch_points list and say so plainly in the summary.

${NO_MEMBER_ATTRIBUTION_RULE}`

  const message = await sendAiApiRequest<{ summary: string; watch_points: string[] }>('fast_model', 500, prompt, instructorSummarySchema)

  return {
    summary: message.summary,
    watchPoints: message.watch_points,
  }
}

const finalReportSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    highlights: { type: 'array', items: { type: 'string' } },
    growth_areas: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'highlights', 'growth_areas'],
  additionalProperties: false,
}

export interface FinalReportProjectContext {
  title: string | null
  brief: string | null
  grade: string | null
}

export interface FinalReportPlantSummary {
  missedDeadlines: number
  recoveredDeadlines: number
  checkinDecrements: number
  finalState: string
}

export interface FinalReportSummaryResult {
  summary: string
  highlights: string[]
  growthAreas: string[]
}

export async function generateFinalReportSummary(
  project: FinalReportProjectContext,
  agreements: Partial<Record<ChatComponent, string>>,
  plant: FinalReportPlantSummary,
): Promise<FinalReportSummaryResult> {
  const projectSection = [
    project.title ? `Project title: ${project.title}` : '',
    project.brief ? `Assignment brief: ${project.brief}` : '',
    project.grade ? `Final grade the team received for this project: ${project.grade}` : '',
  ].filter(Boolean).join('\n') || 'No project details were provided.'

  const agreementSection = CHAT_COMPONENTS
    .filter(c => agreements[c])
    .map(c => `${COMPONENT_LABELS[c]}: ${agreements[c]}`)
    .join('\n') || 'No agreement text available.'

  const prompt = `You are writing a short final wrap-up for a student team's collaboration process, at the end of their project.

${projectSection}

What the team agreed on at the start:
${agreementSection}

How the plant (the team's shared health indicator) moved over the project: ${plant.missedDeadlines} deadline(s) were missed, ${plant.recoveredDeadlines} of those were recovered by finishing and getting the work approved, and check-ins applied ${plant.checkinDecrements} additional level decrement(s) for CHAT-alignment tension. The plant ended the project in state: ${plant.finalState}.

Write a 3-4 sentence plain-language narrative of how this team collaborated and delivered, covering both how they worked together and how the work actually got done. If a final grade is given, connect it to the collaboration story — say plainly how the process related to the result. Do not restate the grade on its own, and do not speculate about a grade that wasn't given. Then list 2-4 short "went well" highlight bullets, and 2-4 short constructive growth-area bullets (framed for what to watch for next time, not blame). Be specific to what actually happened above — do not invent details that weren't given.

${NO_MEMBER_ATTRIBUTION_RULE}`

  const message = await sendAiApiRequest<{ summary: string; highlights: string[]; growth_areas: string[] }>('default_model', 800, prompt, finalReportSchema)

  return {
    summary: message.summary,
    highlights: message.highlights,
    growthAreas: message.growth_areas,
  }
}
