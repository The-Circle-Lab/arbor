import { NextResponse } from 'next/server'
import { queryOne, isUniqueViolation } from '@/lib/db'
import { hashPassword } from '@/lib/auth/password'
import { signSessionToken, setSessionCookie } from '@/lib/auth/jwt'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const VALID_ROLES = ['student', 'instructor']

function isValidRole(value: unknown): value is 'student' | 'instructor' {
  return typeof value === 'string' && VALID_ROLES.includes(value)
}

export async function POST(req: Request) {
  const { email, password, displayName, pronouns, role } = await req.json()
  const normalizedRole = isValidRole(role) ? role : 'student'

  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(normalizedEmail)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }
  if (new TextEncoder().encode(password).length > 72) {
    return NextResponse.json({ error: 'Password must be 72 bytes or fewer.' }, { status: 400 })
  }
  if (typeof displayName !== 'string' || !displayName.trim()) {
    return NextResponse.json({ error: 'Name required.' }, { status: 400 })
  }

  const existing = await queryOne('SELECT id FROM users WHERE email = $1', [normalizedEmail])
  if (existing) {
    return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 })
  }

  const passwordHash = await hashPassword(password)

  let user: { id: string; email: string; role: string; token_version: number }
  try {
    const inserted = await queryOne<{ id: string; email: string; role: string; token_version: number }>(
      'INSERT INTO users (email, password_hash, display_name, pronouns, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, role, token_version',
      [normalizedEmail, passwordHash, displayName.trim(), pronouns?.trim() || null, normalizedRole]
    )
    if (!inserted) throw new Error('Insert returned no row')
    user = inserted
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 })
    }
    throw e
  }

  const token = await signSessionToken(user.id, user.token_version)
  await setSessionCookie(token)

  return NextResponse.json({ id: user.id, email: user.email, role: user.role }, { status: 201 })
}
