/** Derives ten Marks from a hash: marks.json holds the 64, in an order pinned forever. */
import MARKS from './marks.json' with { type: 'json' }

/** Indexed by a 6-bit value (0-63). */
export const EMOJIS: readonly string[] = MARKS.map(([emoji]) => emoji!)
/** The spoken name of each Mark, same index. */
export const NAMES: readonly string[] = MARKS.map(([, name]) => name!)

/** 10 Marks × 6 bits = 60 bits. */
export const COUNT = 10

/** Hashed exactly as written: changing any value changes every output. */
export const PREFIX = 'socklove.eth:check:v1:'
export const SALT = 'socklove.eth:check:v1:salt'
export const ITERATIONS = 4_000_000

const ZERO = '0'.repeat(64)

/** The browser cannot derive: no WebCrypto, or it failed. The one error shown to the reader. */
export class CannotRead extends Error {
  constructor() {
    super('This browser cannot read the Marks.')
  }
}

/** The hash as 64 lowercase hex digits, or null for anything else; whitespace is stripped, a pasted hash may wrap. */
export function normalize(hash: string): string | null {
  const hex = hash.replace(/\s+/g, '').replace(/^0x/i, '').toLowerCase()
  return /^[0-9a-f]{64}$/.test(hex) && hex !== ZERO ? hex : null
}

/** The ten Mark indices for a hash; never falls back to anything weaker than WebCrypto. */
export async function marks(hash: string): Promise<number[]> {
  const hex = normalize(hash)
  if (!hex) throw new Error('not a 32-byte hash')
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new CannotRead()
  try {
    const encoder = new TextEncoder()
    const key = await subtle.importKey('raw', encoder.encode(PREFIX + hex), 'PBKDF2', false, ['deriveBits'])
    const derived = await subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(SALT), iterations: ITERATIONS },
      key,
      COUNT * 8,
    )
    // One byte per Mark, top 6 bits each.
    return [...new Uint8Array(derived)].map((b) => b >> 2)
  } catch {
    throw new CannotRead()
  }
}
