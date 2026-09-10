# Arbour — Build Brief for Monday Live Test

## Context
Arbour is a CSCL (computer-supported collaborative learning) tool for CS student teams, grounded in Cultural-Historical Activity Theory (CHAT, Engeström). It diagnoses collaboration breakdown as a structural problem — teams fail not because of bad attitudes, but because their "activity system" (the shared goal, roles, rules, tools, and community that structure collective work) is never properly established. Norm misalignment across these components is the underlying condition behind most collaboration breakdowns.

Arbour operationalizes three design conjectures:
1. **Early visibility** — make the activity system's components explicit before work begins.
2. **Collaboration health as accumulated tension** — represent the team's state as the accumulation (or resolution) of tensions across CHAT components, not as individual performance.
3. **Group-level, non-punitive signaling** — surface tension at the team level, prompting reflection and renegotiation rather than assigning blame.

This build is a working, multi-person, live-tested instantiation of all three conjectures, for a real test this Monday between the researcher (Annie) and her research mentor (Michael), using separate devices. The product itself must support teams of up to 4 members — Monday's test happens to use 2, but nothing in the logic should assume exactly 2 members. Comparison, reveal, and check-in logic must work across however many members actually joined a team (2, 3, or 4), not just a fixed pair.

## Goal for Monday
A real working web app — not a static demo — where multiple people (2 for Monday's test) on separate devices:
1. Each complete an individual reflection (CHAT-mapped questions).
2. See a side-by-side reveal of everyone's answers, with an AI-generated comment on alignment/misalignment across all members, **before** any check-ins happen.
3. Jointly record a group agreement per component.
4. Complete two simulated check-in cycles (separately, per person).
5. After each check-in cycle, see a shared "plant" whose visual state reflects accumulated tension, and can tap/click it to reveal which CHAT component(s) are misaligned, alongside a short AI-generated nudge naming the specific gap in plain language.
6. Mark flagged components as negotiated/resolved (optionally recording what was agreed), and once all currently-flagged components are resolved, unlock a "Start working" screen confirming the team is aligned and can proceed.

The tool must support team sizes of 2-4 in its data model and logic from the start.

## Tech stack
- Next.js (full-stack, App Router)
- Postgres for persistence (use whatever's fastest to provision — e.g. Vercel Postgres or a simple hosted instance)
- Vercel for hosting (needs to be reachable via a real URL from two separate devices)
- Anthropic API for the AI comparison/nudge logic (model: claude-sonnet-4-6)

## Data model (rough shape, adjust as needed)
- **Team**: id, name, created_at
- **Member**: id, team_id, display_name (no real auth needed — fastest path: enter name + team code to join)
- **Agreement**: team_id, component (enum: object, division_of_labor, rules, tools, community), agreed_text
- **IndividualReflection**: member_id, component, response (text or structured, depending on component — see questions below)
- **CheckIn**: member_id, cycle_number (1 or 2), component, rating (aligned / slightly_off / very_off), optional text
- **PlantState**: team_id, cycle_number, computed_state (thriving/healthy/struggling/wilting), flagged_components (array), ai_nudge_text
- **Resolution**: team_id, component, cycle_number (or null if resolved at reveal stage), resolved (boolean), resolution_note (optional text), resolved_at

Note: all tables involving "the other member" comparisons (reveal, check-in divergence) must be written generically over however many Members belong to a Team (2-4), not assuming exactly 2.

## Flow

### 1. Team setup
Fastest possible: one person creates a team (gets a code), the other joins with that code + their name. No real auth needed.

### 2. Individual reflection (Part 1)
Each person answers, privately, mapped to all five CHAT components (plus Subject, collected as personal profile info only):

**Object**
- What does a successful outcome look like to you, specifically?
- If you had to pick one thing this project must achieve for you to call it a success, what is it?

**Subject** (collected as personal profile info during reflection only — not part of reveal, agreements, or check-in comparisons)
- What do you want to get out of doing this project — beyond the grade/deliverable?
- What kind of contributor are you in group work — and is that the role you want this time?

**Division of Labor**
- What role do you expect or want to take on?
- What does a fair workload distribution look like to you?
- Is there anything you strongly want to own, or strongly want to avoid?

**Rules**
- Communication: where, and what response time is reasonable?
- Meetings: how often, and what counts as showing up prepared?
- Decision-making: consensus, majority, or role-based — and how should conflict be resolved?
- Work quality: what's your bar for "good enough" vs. "not acceptable"?

**Tools**
- What tools/platforms do you expect to use for this project?
- Is there a tool you rely on that others might not be using?

**Community** (multi-select + "Other" free text)
- Who do you consider part of this project's ecosystem? (Group members / Instructor / TA / Client or external stakeholder / Other: ___)
- Who do you think has no real say in how the group operates? (Instructor / TA / Client or external stakeholder / A specific group member / Nobody outside the group / Other: ___)

### 3. Reveal + AI comparison (before check-ins)
Once both members have submitted, show a side-by-side view per component (Annie's answer vs. Michael's answer). Alongside this, make an AI call that compares the two sets of answers and generates a short plain-language comment on where they align or diverge per component. This happens **before** any group agreement is written — it's meant to prompt the actual negotiation conversation.

### 4. Group agreement (Part 2)
After discussing the reveal, both members (or just one, recording for the group) write the final agreed text per CHAT component. This is stored as the baseline (`Agreement` table) that check-ins get compared against later.

### 5. Check-in cycles (x2)
Each cycle, both members independently answer the check-in questions:

**Object** — Do you still feel like the group is working toward the same outcome you agreed on? (rating + optional text)

(Subject is not part of check-ins — it's collected once, as personal profile info, during reflection.)

**Division of Labor**
- Does the current workload feel fair, given what was agreed? (rating + optional text)
- Is there anything you've ended up doing that wasn't part of your expected role? (optional text)

**Rules**
- Has communication matched what was agreed? (rating + optional text)
- Have meetings happened the way you expected? (rating + optional text)
- Has a decision or disagreement come up — if so, was it handled the way you agreed? (optional text)

**Tools** — Has everyone been using the tools you agreed on, or has something shifted? (rating + optional text)

**Community** — Has anyone outside the group started influencing decisions in a way that wasn't expected? (rating + optional text)

Use a simple 3-point rating scale (aligned / slightly off / very off) for the rating fields, each with an optional short text field.

### 6. Plant state + AI nudge (after each check-in cycle)
Once both members submit their check-in for a cycle:
1. Compute the plant's state (thriving / healthy / struggling / wilting) based on the accumulation of "slightly off" and "very off" ratings across components, and on divergence between the two members' ratings/text for the same component.
2. Make an AI call that:
   - Identifies which CHAT component(s) are flagged.
   - Generates ONE short nudge (same text shown to both members) naming the specific misalignment in plain, non-punitive language — e.g. "Meeting expectations seem to have drifted — Annie expected daily check-ins, Michael expected twice a week. This wasn't fully resolved in your original agreement."
3. The plant visually reflects this state. Tapping/clicking it reveals ALL flagged components at once, plus the AI nudge text.

This should re-run after cycle 2 as well, so the plant's evolution across both cycles is visible.

### 7. Negotiation checkoff → Start Working screen
Whenever components are flagged (at the reveal stage, or after a check-in cycle), each flagged component should have a "Mark as negotiated/resolved" action, with an optional short text field to record what was agreed in resolving it (stored in `Resolution`).

Once **all currently-flagged components** for the team are marked resolved, unlock a "Start Working" screen/state — a simple confirmation screen indicating the team is aligned and can proceed. This should re-lock (i.e. block the "Start Working" state) if a later check-in cycle flags new or recurring tension, until those are resolved too.

This creates the full demonstrable arc: plant shows tension → team discusses live → marks resolved → plant recovers → "Start Working" unlocks.

## AI prompt design notes
- The AI's job at both the reveal stage and the check-in stage is **diagnostic, not directive** — it should name the gap, not tell the team what to do about it. Consistent with conjecture 3 (non-punitive signaling).
- Ground the AI's comparison logic explicitly in CHAT terms (e.g., "this is a Division of Labor tension," not just "you two disagree").
- Keep nudge text short — 2-3 sentences max, plain language, no jargon. This is meant to prompt a live conversation between two people standing/sitting near each other, not to be read at length.

## Priorities if time runs short
1. Individual reflection → reveal → agreement (this is the core "early visibility" conjecture and must work)
2. Check-in cycles + plant state + AI nudge (this is what Michael explicitly asked to see — must work)
3. Negotiation checkoff → Start Working screen (closes the loop, gives the demo a satisfying arc)
4. Visual polish on the plant itself (can be simple/rough — a few states is enough, doesn't need to be beautiful)
5. Anything else (instructor view, more than 4 members, etc.) — skip for Monday

## Out of scope for Monday
- Real authentication
- Instructor dashboard
- More than 4 team members
- More than 2 simulated check-in cycles
- Reading/parsing free-form chat messages for misalignment (a future direction, not this build)
