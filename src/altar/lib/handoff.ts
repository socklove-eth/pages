import type { Address, Hex } from 'viem'

export const isHex = (v: unknown, pattern: RegExp): v is Hex => typeof v === 'string' && pattern.test(v)
/** A transaction hash. */
export const TX_HASH = /^0x[0-9a-fA-F]{64}$/

/** Carried in the link's URL fragment; `sig` is absent until signed. */
export interface Handoff {
  safe: Address
  newOwner: Address
  nonce: string
  sig?: Hex
}

export const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const DIGITS = /^[0-9]+$/
/** v must be 27 or 28: the Safe reads 0 and 1 as other signature types. */
const SIGNATURE = /^0x[0-9a-fA-F]{128}1[bcBC]$/
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
/** Half the secp256k1 order: a signature's s above it is the malleable twin of a valid one. */
const HALF_ORDER = ORDER / 2n

/** The low-s form of a signature: a wallet may return the high-s twin, which the link refuses. */
export function lowS(sig: string): Hex {
  // Only a well-formed signature is rewritten; anything else is left for the shape check to refuse.
  if (!SIGNATURE.test(sig)) return `0x${sig.slice(2)}`
  const s = BigInt(`0x${sig.slice(66, 130)}`)
  if (s <= HALF_ORDER) return `0x${sig.slice(2)}`
  const v = sig.slice(130).toLowerCase() === '1b' ? '1c' : '1b'
  return `0x${sig.slice(2, 66)}${(ORDER - s).toString(16).padStart(64, '0')}${v}`
}

/**
 * Checks shape only, not trust: a tampered field changes the hash, so the
 * signature recovers to a non-owner. Unknown fields are dropped.
 */
export function validHandoff(value: unknown): Handoff | null {
  if (typeof value !== 'object' || value === null) return null
  const { safe, newOwner, nonce, sig } = value as Partial<Record<keyof Handoff, unknown>>
  if (!isHex(safe, ADDRESS) || !isHex(newOwner, ADDRESS)) return null
  if (typeof nonce !== 'string' || !DIGITS.test(nonce)) return null
  if (sig !== undefined && (!isHex(sig, SIGNATURE) || BigInt(`0x${sig.slice(66, 130)}`) > HALF_ORDER)) return null
  const h: Handoff = { safe, newOwner, nonce }
  if (sig !== undefined) h.sig = sig
  return h
}

/** Base64url JSON; every value is ASCII, so btoa is safe. */
export function encodeHandoff(h: Handoff): string {
  return btoa(JSON.stringify(h)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The page's address with the handoff as fragment; the unused query is dropped so the link fits the QR code. */
export function linkFor(href: string, h: Handoff): string {
  return `${href.split(/[?#]/)[0]}#${encodeHandoff(h)}`
}

/** Decodes the whole fragment; anything unreadable returns null. */
export function decodeHandoff(fragment: string): Handoff | null {
  const raw = fragment.replace(/^#/, '').trim()
  if (!raw) return null
  try {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/')
    return validHandoff(JSON.parse(atob(b64 + '==='.slice((b64.length + 3) % 4))))
  } catch {
    return null
  }
}
