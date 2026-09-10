'use client'

import { useId, useState } from 'react'
import { Modal } from '@/components/Modal'

interface AllMembersJoinedModalProps {
  onConfirm: () => void
  onDeny: () => void
}

export function AllMembersJoinedModal({ onConfirm, onDeny }: AllMembersJoinedModalProps) {
  const [busy, setBusy] = useState(false)
  const headingId = useId()

  function run(action: () => void) {
    if (busy) return
    setBusy(true)
    action()
  }

  return (
    <Modal open labelledBy={headingId}>
      <div className="p-6">
        <div className="flex items-center gap-3 mb-3">
          <span
            className="flex-none w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xl"
            aria-hidden
          >
            👥
          </span>
          <h2 id={headingId} className="text-lg font-bold text-stone-800">Has everyone joined?</h2>
        </div>
        <p className="text-sm text-stone-600">
          Make sure every teammate has joined the team before voting for a project manager. If someone&apos;s still missing, head back to the lobby and wait for them.
        </p>

        <div className="flex flex-col gap-2 mt-5">
          <button
            onClick={() => run(onConfirm)}
            disabled={busy}
            className="w-full bg-green-700 text-white rounded-xl py-3.5 font-semibold hover:bg-green-800 disabled:opacity-40 transition"
          >
            Yes, everyone&apos;s here
          </button>
          <button
            onClick={() => run(onDeny)}
            disabled={busy}
            className="w-full bg-white text-stone-600 border border-stone-200 rounded-xl py-3.5 font-semibold hover:bg-stone-50 disabled:opacity-40 transition"
          >
            No, back to lobby
          </button>
        </div>
      </div>
    </Modal>
  )
}
