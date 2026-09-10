import { NextResponse } from 'next/server'
import { queryOne, query, isUniqueViolation } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/admin'
import { hashPassword } from '@/lib/auth/password'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface ResearcherRow {
  id: string
  email: string
  display_name: string
  created_at: string
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const researchers = await query<ResearcherRow>(
    "SELECT id, email, display_name, created_at FROM users WHERE role = 'researcher' ORDER BY created_at"
  )

  return NextResponse.json({ researchers })
}

// The only way a `researcher` row can ever be created — signup's
// isValidRole only accepts 'student' | 'instructor', so this is the sole
// entry point. Does not sign a session cookie: the admin is provisioning an
// account for someone else, who logs in themselves at /login afterward.
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email, password, displayName } = await req.json()

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

  let researcher: ResearcherRow
  try {
    const inserted = await queryOne<ResearcherRow>(
      "INSERT INTO users (email, password_hash, display_name, role) VALUES ($1, $2, $3, 'researcher') RETURNING id, email, display_name, created_at",
      [normalizedEmail, passwordHash, displayName.trim()]
    )
    if (!inserted) throw new Error('Insert returned no row')
    researcher = inserted
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 })
    }
    throw e
  }

  return NextResponse.json(researcher, { status: 201 })
}
