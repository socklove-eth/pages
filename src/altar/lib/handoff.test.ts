import { describe, it, expect } from 'vitest'
import { decodeHandoff, encodeHandoff, linkFor, lowS, validHandoff, type Handoff } from './handoff.ts'
import { qrPath } from './qr.ts'

const SAFE = '0x0857293192bF97Ee73bB471c185E1933Fa51E0ca'
const OWNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const SIG = `0x${'ab'.repeat(32)}${'11'.repeat(32)}1b` as const

const signed: Handoff = { safe: SAFE, newOwner: OWNER, nonce: '7', sig: SIG }
const unsigned: Handoff = { safe: SAFE, newOwner: OWNER, nonce: '0' }

/** Base64url of arbitrary JSON text, the way a link would carry it. */
const b64url = (text: string) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

describe('encodeHandoff / decodeHandoff', () => {
  it('round-trips a signed handoff', () => {
    expect(decodeHandoff(encodeHandoff(signed))).toEqual(signed)
  })

  it('emits only base64url characters, with no padding', () => {
    expect(encodeHandoff(signed)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('accepts the fragment with or without its leading #', () => {
    const encoded = encodeHandoff(signed)
    expect(decodeHandoff(`#${encoded}`)).toEqual(signed)
    expect(decodeHandoff(` ${encoded} `)).toEqual(signed)
  })

  it('decodes every padding length', () => {
    for (const nonce of ['1', '12', '123']) {
      const h = { ...unsigned, nonce }
      expect(decodeHandoff(encodeHandoff(h))).toEqual(h)
    }
  })

  it('drops unknown fields', () => {
    const extra = b64url(JSON.stringify({ ...signed, kind: 'x', threshold: 1 }))
    expect(decodeHandoff(extra)).toEqual(signed)
  })

  it('returns null for an empty or unreadable fragment', () => {
    for (const fragment of ['', '#', '   ', '#!!!', b64url('not json'), b64url('null'), b64url('"text"'), b64url('42')]) {
      expect(decodeHandoff(fragment), fragment).toBeNull()
    }
  })
})

describe('validHandoff', () => {
  it('accepts a well-shaped handoff and returns a copy', () => {
    const input = { ...signed }
    const copy = validHandoff(input)
    expect(copy).toEqual(signed)
    expect(copy).not.toBe(input)
  })

  it('rejects anything that is not an object', () => {
    for (const value of [null, undefined, 'x', 1, true]) {
      expect(validHandoff(value)).toBeNull()
    }
  })

  it('rejects a bad address in either field', () => {
    expect(validHandoff({ ...signed, safe: '0x1234' })).toBeNull()
    expect(validHandoff({ ...signed, newOwner: `0x${'g'.repeat(40)}` })).toBeNull()
  })

  it('rejects a nonce that is not digits', () => {
    for (const nonce of ['', '-1', '1.5', '0x1', 'one']) {
      expect(validHandoff({ ...signed, nonce }), nonce).toBeNull()
    }
  })

  it('accepts v as 27 or 28 only: the Safe reads 0 and 1 as other signature types', () => {
    for (const v of ['1b', '1c', '1B']) expect(validHandoff({ ...signed, sig: `0x${'ab'.repeat(32)}${'11'.repeat(32)}${v}` }), v).not.toBeNull()
    for (const v of ['00', '01', '1d', 'ab']) expect(validHandoff({ ...signed, sig: `0x${'ab'.repeat(32)}${'11'.repeat(32)}${v}` }), v).toBeNull()
  })

  it('refuses the high-s twin of a signature, so each signature has one form', () => {
    const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
    const s = BigInt(`0x${'11'.repeat(32)}`)
    const twin = `0x${'ab'.repeat(32)}${(n - s).toString(16).padStart(64, '0')}1c`
    expect(validHandoff({ ...signed, sig: twin })).toBeNull()
    expect(validHandoff({ ...signed, sig: `0x${'ab'.repeat(32)}${(n / 2n).toString(16).padStart(64, '0')}1b` })).not.toBeNull()
  })

  it('turns a wallet\'s high-s signature into its low-s twin, and leaves a low-s one alone', () => {
    const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
    const low = `0x${'ab'.repeat(32)}${'11'.repeat(32)}1b`
    const high = `0x${'ab'.repeat(32)}${(n - BigInt(`0x${'11'.repeat(32)}`)).toString(16).padStart(64, '0')}1c`
    expect(lowS(high)).toBe(low)
    expect(lowS(low)).toBe(low)
    expect(validHandoff({ ...signed, sig: lowS(high) })).not.toBeNull()
  })

  it('repairs no malformed signature: too long, too short or not hex stays refused', () => {
    const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
    const high = `0x${'ab'.repeat(32)}${(n - BigInt(`0x${'11'.repeat(32)}`)).toString(16).padStart(64, '0')}1c`
    for (const bad of [`${high}deadbeef`, '0x', '0x12', `0x${'zz'.repeat(65)}`]) {
      expect(validHandoff({ ...signed, sig: lowS(bad) }), bad.slice(0, 12)).toBeNull()
    }
  })

  it('rejects a signature of the wrong shape', () => {
    for (const sig of ['', '0x', `0x${'ab'.repeat(64)}`, `0x${'zz'.repeat(65)}`, SIG.slice(2)]) {
      expect(validHandoff({ ...signed, sig }), sig).toBeNull()
    }
  })

  it('rejects fields that are not strings', () => {
    expect(validHandoff({ ...signed, nonce: 7 })).toBeNull()
    expect(validHandoff({ ...signed, safe: 1 })).toBeNull()
    expect(validHandoff({ ...signed, newOwner: null })).toBeNull()
    expect(validHandoff({ ...signed, sig: 1 })).toBeNull()
  })

  it('rejects a missing field', () => {
    const { nonce: _nonce, ...withoutNonce } = signed
    expect(validHandoff(withoutNonce)).toBeNull()
  })
})

describe('linkFor', () => {
  const h: Handoff = { safe: SAFE, newOwner: OWNER, nonce: '7', sig: SIG }

  it('is the page address with the handoff as its fragment', () => {
    expect(linkFor('https://altar.socklove.eth.limo/', h)).toBe(`https://altar.socklove.eth.limo/#${encodeHandoff(h)}`)
  })

  it('drops a query and any fragment already there', () => {
    expect(linkFor('https://altar.socklove.eth.limo/?a=1#old', h)).toBe(`https://altar.socklove.eth.limo/#${encodeHandoff(h)}`)
  })

  it('still fits a QR code when the page was opened with a long query', () => {
    const link = linkFor(`https://altar.socklove.eth.limo/?${'a'.repeat(4000)}`, h)
    expect(decodeHandoff(link.split('#')[1] ?? '')).toEqual(h)
    expect(() => qrPath(link)).not.toThrow()
  })
})
