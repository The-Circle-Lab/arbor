'use client'

import { ChatComponent, REFLECTION_QUESTIONS, getReflectionAnswerDisplay } from '@/lib/chat-components'

interface Member {
  id: string
  display_name: string
}

interface DisplayMember {
  id: string
  label: string
}

interface ReflectionAnswersByQuestionProps {
  component: ChatComponent
  members: Member[]
  // HIGH-engagement teams only: replace real names with a "Member N" label,
  // ordered by a hash of member id rather than join order, so answers can't
  // be tied back to a specific person.
  anonymize: boolean
  getResponseData: (memberId: string) => Record<string, unknown> | undefined
}

// Deterministic per-id hash — orders members unpredictably relative to join
// order, but stays identical across renders/polls without needing any
// randomness to be cached in state or a ref.
function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return h
}

export function ReflectionAnswersByQuestion({ component, members, anonymize, getResponseData }: ReflectionAnswersByQuestionProps) {
  const displayMembers: DisplayMember[] = anonymize
    ? [...members]
        .sort((a, b) => hashId(a.id) - hashId(b.id))
        .map((m, idx) => ({ id: m.id, label: `Member ${idx + 1}` }))
    : members.map(m => ({ id: m.id, label: m.display_name }))

  return (
    <div className="flex flex-col gap-4">
      {REFLECTION_QUESTIONS[component].map(q => (
        <div key={q.id}>
          <p className="text-xs font-semibold text-stone-600 mb-2">{q.question}</p>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${Math.max(displayMembers.length, 1)}, minmax(0, 1fr))` }}
          >
            {displayMembers.map(m => {
              const display = getReflectionAnswerDisplay(q, getResponseData(m.id))
              return (
                <div key={m.id} className="bg-stone-50 rounded-lg p-2.5">
                  <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">{m.label}</p>
                  {display ? (
                    <>
                      <p className="text-xs text-stone-700">
                        {display.answer || <span className="text-stone-300 italic">No answer</span>}
                      </p>
                      {display.otherText && (
                        <p className="text-xs text-stone-500 italic mt-1">{`Other: ${display.otherText}`}</p>
                      )}
                      {display.openText && (
                        <p className="text-xs text-stone-500 italic mt-1">{display.openText}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-stone-300 italic">No response</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
