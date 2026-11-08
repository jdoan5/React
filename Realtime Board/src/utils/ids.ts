/**
 * Id minting. Impure (it reads a CSPRNG), which is exactly why it lives in
 * utils/ rather than lib/ — everything in lib/ stays deterministic and testable.
 *
 * Ids are minted on the CLIENT, not by the database. That is what makes a retry
 * safe: a re-sent create carries the same primary key, so the second attempt is
 * an upsert rather than a duplicate card, and there is no temp-id remapping
 * anywhere in the app.
 */

/**
 * A v4 UUID. `crypto.randomUUID` needs a secure context, which covers localhost
 * and every https deployment, but not a plain-http LAN address — so there is a
 * getRandomValues fallback rather than a crash.
 */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  // Set the version (4) and variant (10xx) bits the spec requires.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex: string[] = []
  for (const byte of bytes) hex.push(byte.toString(16).padStart(2, '0'))
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  )
}

/** Avatar colours, picked deterministically from a user id so they never flicker. */
const PALETTE = [
  '#3b6ef5',
  '#e5484d',
  '#f2831f',
  '#12a594',
  '#8e4ec6',
  '#d6409f',
  '#0090ff',
  '#46a758',
]

export function colorFor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]!
}

const ADJECTIVES = ['Swift', 'Quiet', 'Bright', 'Calm', 'Keen', 'Brave', 'Deft', 'Wry']
const ANIMALS = ['Heron', 'Otter', 'Lynx', 'Finch', 'Marten', 'Ibis', 'Shrike', 'Vole']

/** A readable name for a guest, derived from their id so it is stable across reloads. */
export function guestNameFor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 37 + id.charCodeAt(i)) | 0
  const h = Math.abs(hash)
  return `${ADJECTIVES[h % ADJECTIVES.length]} ${ANIMALS[(h >> 5) % ANIMALS.length]}`
}
