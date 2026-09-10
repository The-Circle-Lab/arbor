// Shared join-code generation for teams and courses — same alphabet/length,
// same "keep retrying against a uniqueness check" shape, so the two never
// drift apart on what counts as a valid code.
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const JOIN_CODE_LENGTH = 6
const MAX_ATTEMPTS = 10

export function generateJoinCode(): string {
  return Array.from({ length: JOIN_CODE_LENGTH }, () => JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)]).join('')
}

export async function generateUniqueJoinCode(exists: (code: string) => Promise<boolean>): Promise<string> {
  for (let attempts = 0; attempts < MAX_ATTEMPTS; attempts++) {
    const code = generateJoinCode()
    if (!(await exists(code))) return code
  }
  throw new Error('Could not generate a unique join code, please try again.')
}
