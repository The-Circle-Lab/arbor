export const CHAT_COMPONENTS = [
  'object',
  'division_of_labor',
  'rules',
  'tools',
  'community',
] as const

export type ChatComponent = (typeof CHAT_COMPONENTS)[number]

export function isChatComponent(value: string): value is ChatComponent {
  return CHAT_COMPONENTS.some(c => c === value)
}

export const COMPONENT_LABELS: Record<ChatComponent, string> = {
  object: 'Objective',
  division_of_labor: 'Contribution Structure',
  rules: 'How We Work Together',
  tools: 'Tools & Platforms',
  community: 'Who\'s Involved',
}

export const COMPONENT_DESCRIPTIONS: Record<ChatComponent, string> = {
  object: 'What does success look like — and does your team agree?',
  division_of_labor: 'Who owns what, and what fair contribution looks like to each person',
  rules: 'How the team communicates, meets, decides, and holds quality',
  tools: 'The platforms and tools everyone will actually use',
  community: 'Who has a say in this project, and who doesn\'t',
}

// Subject is no longer a shared CHAT component (it doesn't appear in reveal,
// agreements, or check-ins), but its reflection questions are still asked in
// the reflect wizard, 2nd — right after Objective — and stored on
// `members.subject_responses` instead of `individual_reflections`. Kept as
// standalone exports (not part of the Record<ChatComponent, ...> maps above)
// since `ChatComponent` no longer includes 'subject'.
export const SUBJECT_LABEL = 'Your Role & Goals'
export const SUBJECT_DESCRIPTION = 'What each person wants to get out of this, and the role they want to play'

export interface ReflectionQuestion {
  id: string
  question: string
  type: 'text' | 'multiselect' | 'choice' | 'priority-rank'
  options?: string[]
  withOpenText?: boolean
  shuffleOptions?: boolean
}

export const REFLECTION_QUESTIONS: Record<ChatComponent, ReflectionQuestion[]> = {
  object: [
    {
      id: 'success_definition',
      question: 'What would make this project a clear success for you?',
      type: 'text',
    },
    {
      id: 'priority',
      question: 'Rank each of these by how much they matter to you in this project:',
      type: 'priority-rank',
      options: ['Quality of the final output', 'Meeting the deadline', 'Learning something new', 'A fair and smooth team experience'],
    },
  ],
  division_of_labor: [
    {
      id: 'expected_role',
      question: 'What area of the work do you see yourself taking the lead on?',
      type: 'text',
    },
    {
      id: 'fair_split',
      question: 'What does a fair workload split look like to you?',
      type: 'choice',
      options: ['Equal hours from everyone', 'Weighted by skills and strengths', 'Flexible — whoever has capacity does more', 'Agreed role-based division', 'Other'],
      withOpenText: true,
    },
    {
      id: 'avoid',
      question: 'Is there anything you strongly want to avoid taking on?',
      type: 'text',
    },
  ],
  rules: [
    {
      id: 'communication',
      question: 'Where should the team communicate, and what\'s a reasonable response time?',
      type: 'text',
    },
    {
      id: 'meetings',
      question: 'How often should you meet, and what does showing up prepared mean?',
      type: 'text',
    },
    {
      id: 'decisions',
      question: 'How should the team make decisions when there\'s disagreement? Select all that apply.',
      type: 'multiselect',
      options: ['Consensus — everyone must agree', 'Majority vote', 'Whoever owns that area decides', 'One person has final say', 'Other'],
      withOpenText: true,
    },
    {
      id: 'quality',
      question: 'What\'s your bar for work quality?',
      type: 'choice',
      options: ['Excellent — I\'d be embarrassed by anything less', 'Good enough to meet the brief', 'Functional — done is better than perfect', 'Depends on the task', 'Other'],
    },
  ],
  tools: [
    {
      id: 'expected_tools',
      question: 'What tools or platforms do you expect the team to use?',
      type: 'text',
    },
    {
      id: 'personal_tools',
      question: 'Is there a tool you rely on that others might not be familiar with?',
      type: 'text',
    },
  ],
  community: [
    {
      id: 'stakeholders',
      question: 'Who do you consider part of this project\'s ecosystem?',
      type: 'multiselect',
      options: ['Group members', 'Instructor', 'TA', 'Client or external stakeholder', 'Other'],
    },
    {
      id: 'influence',
      question: 'Who should have a say in how the group actually operates day-to-day?',
      type: 'choice',
      options: ['Only group members', 'Group members + instructor', 'Group members + client/stakeholder', 'Everyone listed above', 'Other'],
    },
  ],
}

// The reflect wizard's 2nd step (right after Objective) — see the
// SUBJECT_LABEL/SUBJECT_DESCRIPTION comment above for why this is separate
// from REFLECTION_QUESTIONS.
export const SUBJECT_QUESTIONS: ReflectionQuestion[] = [
  {
    id: 'personal_goal',
    question: 'What do you want to get out of this project, beyond the deliverable?',
    type: 'text',
  },
  {
    id: 'position',
    question: 'On past team projects, which of these did you usually end up doing? Select all that apply.',
    type: 'multiselect',
    options: ['Proposed a direction and got others on board', 'Kept the group organized and on schedule', 'Took a defined piece and ran it independently', 'Moved between tasks depending on what was needed', 'Took what was assigned and delivered it', 'Filled whatever was left once others had chosen', 'Other'],
    shuffleOptions: true,
  },
  {
    id: 'voice',
    question: 'Think of a time you disagreed with the direction your group was already moving toward. What did you usually do?',
    type: 'choice',
    options: ['Said so in the group conversation', 'Raised it with one person separately', 'Waited to see whether someone else would raise it', 'Went along with it and adjusted my own work around it', 'Other'],
    shuffleOptions: true,
  },
]

export const CHECKIN_QUESTIONS: Record<ChatComponent, { id: string; question: string; hasRating: boolean }[]> = {
  object: [
    { id: 'shared_outcome', question: 'Is the group still working toward the outcome you agreed on?', hasRating: true },
  ],
  division_of_labor: [
    { id: 'workload_fair', question: 'Does the current workload feel fair, given what was agreed?', hasRating: true },
    { id: 'unexpected_work', question: 'Has anything fallen on you that wasn\'t part of your expected role?', hasRating: false },
  ],
  rules: [
    { id: 'communication_match', question: 'Has communication matched what you agreed?', hasRating: true },
    { id: 'meetings_match', question: 'Have meetings happened the way you expected?', hasRating: true },
    { id: 'decision_handling', question: 'If a disagreement came up, was it handled the way you agreed?', hasRating: false },
  ],
  tools: [
    { id: 'tools_used', question: 'Has everyone been using the tools you agreed on?', hasRating: true },
  ],
  community: [
    { id: 'outside_influence', question: 'Has anyone outside the group been influencing decisions in a way that wasn\'t expected?', hasRating: true },
  ],
}

export type Rating = 'aligned' | 'slightly_off' | 'very_off'

export const RATING_LABELS: Record<Rating, string> = {
  aligned: 'Aligned',
  slightly_off: 'Slightly off',
  very_off: 'Very off',
}

export const RATING_VALUES: Record<Rating, number> = {
  aligned: 0,
  slightly_off: 1,
  very_off: 2,
}
