'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, getMembership } from '@/lib/session'

interface Member {
  id: string
  display_name: string
}

interface TeamResponse {
  id: string
  members: Member[]
  project_manager_id: string | null
  project_manager_votes: Record<string, string> | null
}

export default function ChooseProjectManagerPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const { loading, user, memberships } = useSession()
  const membership = getMembership(memberships, code)

  const [teamId, setTeamId] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [votes, setVotes] = useState<Record<string, string>>({})
  const [myVote, setMyVote] = useState<string | null>(null)
  const [voting, setVoting] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user || !membership) { router.replace('/'); return }
    load()
    const interval = setInterval(load, 3000)
    return () => clearInterval(interval)
  }, [code, loading, user, membership])

  async function load() {
    const res = await fetch(`/api/teams/${code.toUpperCase()}`)
    if (!res.ok) return
    const data: TeamResponse = await res.json()
    setTeamId(data.id)
    setMembers(data.members)
    const v: Record<string, string> = data.project_manager_votes ?? {}
    setVotes(v)
    if (membership && v[membership.member_id]) setMyVote(v[membership.member_id])

    // The project manager is fixed for the life of the group once elected.
    if (data.project_manager_id) {
      router.push(`/${code}/choose-plant`)
    }
  }

  async function castVote(votedForMemberId: string) {
    if (!teamId || !membership || voting) return
    setVoting(true)
    setMyVote(votedForMemberId)
    const res = await fetch('/api/teams', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, projectManagerVote: { memberId: membership.member_id, votedForMemberId } }),
    })
    const data = await res.json()
    if (data.agreed) {
      router.push(`/${code}/choose-plant`)
      return
    }
    await load()
    setVoting(false)
  }

  const notYetVoted = members.filter(m => !votes[m.id])
  const distinctChoices = new Set(Object.values(votes))
  const everyoneVoted = members.length > 0 && notYetVoted.length === 0
  const split = everyoneVoted && distinctChoices.size > 1

  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-stone-800">Choose your Project Manager</h1>
          <p className="text-stone-500 text-sm mt-1">
            Pick who will keep Arbour in sync with what the team decides. Everyone needs to agree — this choice is permanent for the life of the group.
          </p>
        </div>

        <div className="bg-green-50 rounded-2xl border border-green-100 p-5 mb-6">
          <p className="text-xs text-green-700 uppercase tracking-wide font-semibold mb-3">What the project manager does</p>
          <ul className="text-sm text-green-900 space-y-2">
            <li className="flex gap-2"><span>•</span> Inputs the project details. </li>
            <li className="flex gap-2"><span>•</span> Records group decisions and negotiations. </li>
            <li className="flex gap-2"><span>•</span> Serves as the “scribe” of the group after group discussions. </li>
          </ul>
          <p className="text-xs text-green-700/80 mt-3">
            The team makes the calls — the project manager just makes sure Arbour reflects them. Choose someone willing to keep on top of it; there&apos;s no re-vote once the team agrees.
          </p>
        </div>

        <div className="flex flex-col gap-3 mb-6">
          {members.map(m => {
            const isMyVote = myVote === m.id
            const voters = members.filter(v => votes[v.id] === m.id)
            return (
              <button
                key={m.id}
                onClick={() => castVote(m.id)}
                disabled={voting}
                className={`rounded-2xl p-4 flex items-center gap-3 border-2 transition text-left ${
                  isMyVote
                    ? 'border-green-600 bg-green-50'
                    : 'border-stone-200 bg-white hover:border-stone-300'
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-semibold text-sm shrink-0">
                  {m.display_name[0].toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-stone-700">
                    {m.display_name}
                    {m.id === membership?.member_id && <span className="text-stone-400 font-normal"> (you)</span>}
                  </p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {voters.map(v => (
                      <span
                        key={v.id}
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          v.id === membership?.member_id
                            ? 'bg-green-100 text-green-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {v.id === membership?.member_id ? 'You' : v.display_name}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {!myVote && (
          <p className="text-center text-sm text-stone-400">Tap a teammate to cast your vote. You can vote for yourself.</p>
        )}

        {myVote && !everyoneVoted && (
          <div className="text-center text-sm text-stone-500 bg-white rounded-xl border border-stone-100 py-4 px-5">
            {`Waiting for ${notYetVoted.map(m => m.display_name).join(', ')} to vote…`}
          </div>
        )}

        {split && (
          <div className="text-center text-sm text-amber-700 bg-amber-50 rounded-xl border border-amber-100 py-4 px-5">
            {`The team is split across ${distinctChoices.size} choices. Talk it over and tap to consolidate on one.`}
          </div>
        )}
      </div>
    </main>
  )
}
