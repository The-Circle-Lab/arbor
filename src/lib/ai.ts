import { CHAT_COMPONENTS, ChatComponent, COMPONENT_LABELS } from './chat-components'
import { sendAiApiRequest } from './ai-api'
import type { EngagementLevel } from './subject-scoring'

// Reveal's own flag/comment schema — the original 2-field shape, with no
// split_reason. Kept separate from componentAnalysisSchema below (which
// still carries split_reason for generateCheckinComparison) so reverting
// reveal's prompt back to "the original prompt that flags the components"
// doesn't touch check-in's already-working split-reason feature.
interface FlagAnalysisResponse {
  components: Record<ChatComponent, { comment: string; flagged: boolean }>
}

const flagAnalysisSchema = {
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

// Builds a schema requiring exactly one split-reason string per flagged
// component — dynamic because the flagged set differs every team, same
// pattern as buildTaskSuggestionsSchema/buildDeadlineSuggestionsSchema below.
function buildSplitReasonSchema(components: ChatComponent[]) {
  return {
    type: 'object',
    properties: {
      split_reasons: {
        type: 'object',
        properties: Object.fromEntries(components.map(c => [c, { type: 'string' }])),
        required: [...components],
        additionalProperties: false,
      },
    },
    required: ['split_reasons'],
    additionalProperties: false,
  }
}

// generateCheckinComparison's shared schema — still 3 fields (comment,
// flagged, split_reason) generated together in one call, unlike reveal's now
// two-call flow above. Left as-is since check-in's split-reason feature
// already works this way and wasn't part of this change.
interface ComponentAnalysisResponse {
  components: Record<ChatComponent, { comment: string; flagged: boolean; split_reason: string }>
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
          split_reason: { type: 'string' },
        },
        required: ['comment', 'flagged', 'split_reason'],
        additionalProperties: false,
      }])),
      required: [...CHAT_COMPONENTS],
      additionalProperties: false,
    },
  },
  required: ['components'],
  additionalProperties: false,
}

const misalignmentClauseSchema = {
  type: 'object',
  properties: { clause: { type: 'string' } },
  required: ['clause'],
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
  // Only flagged components get an entry — nothing ever displays a split
  // reason for a non-flagged one, and the second AI call below only asks for
  // reasons on the components the first call actually flagged.
  splitReasons: Partial<Record<ChatComponent, string>>
}

// Shared by generateCheckinComparison — asks the model to analyze all five
// CHAT components (comment, flagged, and a split-reason clause) in one call,
// then splits that into a per-component comment map, the flagged subset, and
// a split-reason map. generateRevealComparison below no longer uses this —
// see the two-call flow it runs instead.
function splitComponentAnalysis(components: ComponentAnalysisResponse['components']): {
  perComponent: Record<ChatComponent, string>
  flaggedComponents: ChatComponent[]
  splitReasons: Record<ChatComponent, string>
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
    splitReasons: {
      object: components.object.split_reason,
      division_of_labor: components.division_of_labor.split_reason,
      rules: components.rules.split_reason,
      tools: components.tools.split_reason,
      community: components.community.split_reason,
    },
  }
}

// Runs the original flag/comment prompt first (unchanged from before
// split-reason existed), then — only for a MEDIUM-engagement team, and only
// if anything got flagged — a second, separate prompt asking for a
// split-reason clause for just those flagged components. LOW and HIGH teams
// never display a split reason anywhere, so skipping that second call for
// them isn't just an optimization, it avoids generating text nobody sees.
export async function generateRevealComparison(
  members: MemberReflection[],
  projectContext?: string,
  engagementLevel?: EngagementLevel
): Promise<RevealAIResult> {
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
1. Write a 2-3 sentence plain-language comment that identifies specific points where the team's answers align, and specific points where there is a misalignment. Name the CHAT component explicitly. Do not tell the team what to do — only name the specific points of alignment or misalignment. No jargon beyond the component name itself. Write it about the team as a whole, following the attribution rule below.
2. Decide if this component should be FLAGGED (true/false). Flag it if there is a meaningful gap or potential misalignment that the team should discuss before proceeding.

${NO_MEMBER_ATTRIBUTION_RULE}`

  const message = await sendAiApiRequest<FlagAnalysisResponse>('fast_model', 1500, prompt, flagAnalysisSchema)

  const perComponent: Record<ChatComponent, string> = {
    object: message.components.object.comment,
    division_of_labor: message.components.division_of_labor.comment,
    rules: message.components.rules.comment,
    tools: message.components.tools.comment,
    community: message.components.community.comment,
  }
  const flaggedComponents = CHAT_COMPONENTS.filter(c => message.components[c].flagged)

  const splitReasons = engagementLevel === 'medium'
    ? await generateSplitReasons(flaggedComponents, members)
    : {}

  return { perComponent, flaggedComponents, splitReasons }
}

// Second call for generateRevealComparison above: asks only for a
// split-reason clause, only for the components already known to be flagged.
// A no-op (no AI call) when nothing's flagged.
export async function generateSplitReasons(
  flaggedComponents: ChatComponent[],
  members: MemberReflection[]
): Promise<Partial<Record<ChatComponent, string>>> {
  if (flaggedComponents.length === 0) return {}

  const memberSummaries = members.map(m => {
    const sections = flaggedComponents.map(comp =>
      `[${COMPONENT_LABELS[comp]}]\n${JSON.stringify(m.responses[comp], null, 2)}`
    ).join('\n\n')
    return `=== ${m.displayName} ===\n${sections}`
  }).join('\n\n')

  const componentList = flaggedComponents.map(c => COMPONENT_LABELS[c]).join(', ')

  const prompt = `A student team's individual reflections were analyzed using CHAT (Cultural-Historical Activity Theory), and the following components were flagged as having a meaningful gap: ${componentList}.

Their individual reflections for just these flagged components are below.

${memberSummaries}

For each flagged component, write a short causal clause — NOT a full sentence — that grammatically completes the phrase "...split on this, because ___" (e.g. "some of you are prioritizing polish while others are prioritizing meeting the deadline").

${NO_MEMBER_ATTRIBUTION_RULE}`

  const schema = buildSplitReasonSchema(flaggedComponents)
  const message = await sendAiApiRequest<{ split_reasons: Record<string, string> }>('fast_model', 600, prompt, schema)

  const result: Partial<Record<ChatComponent, string>> = {}
  for (const c of flaggedComponents) {
    result[c] = message.split_reasons[c]
  }
  return result
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

Draft a 1-2 sentence group agreement in first-person plural (starting with "We...") that captures what this team has decided about ${COMPONENT_LABELS[component]}. Be specific about what the team agreed on and how they are going to move forward with their group work. Plain language, no jargon. Be specific to what they actually wrote — do not add things they didn't say.`

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

export async function generateMisalignmentSynthesis(
  component: ChatComponent,
  anonymizedSubmissions: string[],
  priorAttempt?: { draftText: string }
): Promise<string> {
  const submissionsText = anonymizedSubmissions.length > 0
    ? anonymizedSubmissions.map((s, i) => `Proposal ${i + 1}: ${s}`).join('\n\n')
    : 'No proposals were submitted — team members either skipped this step or nothing came through.'

  const priorSection = priorAttempt
    ? `\nA previous draft was rejected by the team:\n"${priorAttempt.draftText}"\nWrite a materially different attempt that still draws on the proposals below — don't just reword the rejected draft.`
    : ''

  const prompt = `A student team had a meaningful disagreement on one component of their group agreement (${COMPONENT_LABELS[component]}) using CHAT (Cultural-Historical Activity Theory). Instead of discussing it live, each member privately proposed what the group should do about it. Their proposals (anonymous, unordered) are below.

${submissionsText}
${priorSection}

Synthesize these into a single 1-3 sentence proposed group agreement clause, in first-person plural (starting with "We..."), that draws on the range of proposals above as fairly as possible. Do not favor one proposal outright if they conflict — find real common ground or an explicit compromise. Plain language, no jargon. Be specific to what was actually proposed — do not invent commitments nobody suggested.

${NO_MEMBER_ATTRIBUTION_RULE}`

  const message = await sendAiApiRequest<{ clause: string }>('default_model', 400, prompt, misalignmentClauseSchema)
  return message.clause
}

export interface CheckinSummary {
  displayName: string
  checkins: Partial<Record<ChatComponent, { rating?: string; notes?: Record<string, string> }>>
}

export interface CheckinComparisonResult {
  perComponent: Record<ChatComponent, string>
  flaggedComponents: ChatComponent[]
  splitReasons: Record<ChatComponent, string>
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

For each of the five CHAT components (object, division_of_labor, rules, tools, community), do three things:
1. Write a 2-3 sentence plain-language comment on whether the team is holding to what they agreed, or where tension has appeared since. Reference the original agreement vs. what the team now reports. Name the CHAT component. Do not tell the team what to do — only name the gap or the alignment. No jargon beyond the component name. Write it about the team as a whole, following the attribution rule below.
2. Decide if this component should be FLAGGED (true/false). Flag it if there is a "very_off" rating, a divergence between members, or drift from the original agreement that the team should discuss.
3. Write a short causal clause — NOT a full sentence — that grammatically completes the phrase "...shifted on this, because ___" (this is about what changed since the team's original agreement, not the original disagreement — e.g. "the workload picked up faster than expected for some of you while others had more time freed up"). Write this even for components you don't flag; it will only be shown when the component is flagged.

${NO_MEMBER_ATTRIBUTION_RULE}`

  const message = await sendAiApiRequest<ComponentAnalysisResponse>('fast_model', 1800, prompt, componentAnalysisSchema)

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
