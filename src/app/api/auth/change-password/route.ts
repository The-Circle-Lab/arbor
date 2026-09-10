import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { requireUser, signSessionToken, setSessionCookie } from '@/lib/auth/jwt'

export async function POST(req: Request) {
  const userId = await requireUser()
  if (!userId) {
    return NextResponse.json({ error: 'Not logged in.' }, { status: 401 })
  }

  const { currentPassword, newPassword } = await req.json()

  if (typeof currentPassword !== 'string' || !currentPassword) {
    return NextResponse.json({ error: 'Current password is required.' }, { status: 400 })
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }
  if (new TextEncoder().encode(newPassword).length > 72) {
    return NextResponse.json({ error: 'Password must be 72 bytes or fewer.' }, { status: 400 })
  }

  const row = await queryOne<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId]
  )
  if (!row) throw new Error('User not found')

  const valid = await verifyPassword(currentPassword, row.password_hash)
  if (!valid) {
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 })
  }

  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: 'New password must be different from your current password.' },
      { status: 400 }
    )
  }

  const passwordHash = await hashPassword(newPassword)

  const updated = await queryOne<{ token_version: number }>(
    'UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2 RETURNING token_version',
    [passwordHash, userId]
  )
  if (!updated) throw new Error('Update returned no row')

  const token = await signSessionToken(userId, updated.token_version)
  await setSessionCookie(token)

  return NextResponse.json({ ok: true })
}
