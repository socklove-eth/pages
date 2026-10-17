/** The vocabulary, its spoken names, and the derivation's reference vectors. */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CannotRead, COUNT, EMOJIS, ITERATIONS, NAMES, PREFIX, SALT, marks, normalize } from './marks.ts'

// Resolve from the vitest root: import.meta.url is an http:// URL under jsdom.
const MARKS_JSON = resolve(process.cwd(), 'marks/marks.json')

/** Levenshtein distance. */
function editDistance(a: string, b: string): number {
  let prev = [...Array(b.length + 1).keys()]
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]!
}

describe('marks.json', () => {
  it('has pinned bytes', () => {
    // Any change to a Mark, a name or their order fails here until the pin is moved on purpose.
    const sha256 = createHash('sha256').update(readFileSync(MARKS_JSON)).digest('hex')
    expect(sha256).toBe('d43bd9d5465859fc872b3b0573f974255b7d16afd71fa5f0325453b8608df1c0')
  })

  it('holds 64 pairs of an emoji and its name, nothing else', () => {
    const pairs = JSON.parse(readFileSync(MARKS_JSON, 'utf8')) as unknown[]
    expect(pairs).toHaveLength(64)
    for (const pair of pairs) {
      expect(Array.isArray(pair) && pair.length === 2 && pair.every((v) => typeof v === 'string'), JSON.stringify(pair)).toBe(true)
    }
  })
})

describe('the Marks', () => {

  it('begin with the wall and end with the heart', () => {
    expect([EMOJIS[0], NAMES[0]]).toEqual(['🧱', 'wall'])
    expect([EMOJIS[63], NAMES[63]]).toEqual(['🫀', 'heart'])
  })

  it('repeat no emojis', () => {
    expect(new Set(EMOJIS).size).toBe(64)
  })

  it('carry no ZWJ sequence and no skin-tone modifier', () => {
    // Both render inconsistently across platforms.
    expect(EMOJIS.filter((e) => e.includes('‍'))).toEqual([])
    expect(EMOJIS.filter((e) => /[\u{1F3FB}-\u{1F3FF}]/u.test(e))).toEqual([])
  })

  it('pin the Marks that depend on VS16', () => {
    // U+FE0F Marks can fall back to monochrome text; the set must not grow unnoticed.
    expect(EMOJIS.filter((e) => e.includes('️'))).toEqual(['🕯️', '❄️', '☀️', '🕳️', '👁️', '🌬️', '⚖️', '🛏️'])
  })

  it('are one code point each, plus VS16 where a Mark needs it', () => {
    for (const mark of EMOJIS) {
      const points = Array.from(mark)
      expect(points.length, mark).toBeLessThanOrEqual(2)
      if (points.length === 2) expect(points[1], mark).toBe('️')
    }
  })

  it('carry nothing after Emoji 13.0', () => {
    // Single-code-point emojis added after 13.0, through Emoji 18.0 (Unicode's emoji-data.txt).
    const after13 = /[\u{1F6D8}-\u{1F6D9}\u{1F6DC}-\u{1F6DF}\u{1F7F0}\u{1F979}\u{1F9CC}\u{1FA75}-\u{1FA77}\u{1FA7B}-\u{1FA7C}\u{1FA87}-\u{1FA8F}\u{1FAA9}-\u{1FAAF}\u{1FAB7}-\u{1FABF}\u{1FAC3}-\u{1FAC6}\u{1FAC8}\u{1FACC}-\u{1FACF}\u{1FAD7}-\u{1FADD}\u{1FADF}-\u{1FAEB}\u{1FAEF}-\u{1FAFA}]/u
    expect(EMOJIS.filter((e) => after13.test(e))).toEqual([])
  })
})

describe('the spoken names', () => {
  // Two different positions must never sound alike.

  it('repeat no name, and no name is a prefix of another', () => {
    expect(new Set(NAMES).size).toBe(64)
    const prefixes = NAMES.flatMap((a) => NAMES.filter((b) => a !== b && b.startsWith(a)).map((b) => `${a} ⊂ ${b}`))
    expect(prefixes).toEqual([])
  })

  it('keep every pair more than one edit apart', () => {
    const tooClose: string[] = []
    for (let i = 0; i < NAMES.length; i++) {
      for (let j = i + 1; j < NAMES.length; j++) {
        const [a, b] = [NAMES[i]!, NAMES[j]!]
        if (editDistance(a, b) < 2) tooClose.push(`${a}/${b}`)
      }
    }
    expect(tooClose).toEqual([])
  })

  it('let no two names of the same length rhyme', () => {
    // Same length and same last three letters counts as a rhyme.
    const rhymes: string[] = []
    for (let i = 0; i < NAMES.length; i++) {
      for (let j = i + 1; j < NAMES.length; j++) {
        const [a, b] = [NAMES[i]!, NAMES[j]!]
        if (a.length === b.length && a.slice(-3) === b.slice(-3)) rhymes.push(`${a}/${b}`)
      }
    }
    expect(rhymes).toEqual([])
  })

  it('are one lowercase word each, short enough to say', () => {
    for (const name of NAMES) expect(name, name).toMatch(/^[a-z]{3,9}$/)
  })
})

describe('normalize', () => {
  const CANONICAL = 'e0e486cadd1b2ce95a6105f8168186ffeb9af4241e7b4aa718c14c7430f8aaed'

  it('accepts a bare hash, uppercase, and whitespace anywhere', () => {
    expect(normalize(`0x${CANONICAL}`)).toBe(CANONICAL)
    expect(normalize(CANONICAL)).toBe(CANONICAL)
    expect(normalize(`0x${CANONICAL.toUpperCase()}`)).toBe(CANONICAL)
    expect(normalize(`  0x${CANONICAL} \n`)).toBe(CANONICAL)
    expect(normalize(`0x${CANONICAL.slice(0, 30)}\n  ${CANONICAL.slice(30)}`)).toBe(CANONICAL)
  })

  it('refuses anything that is not a 32-byte hash, and the zero hash', () => {
    for (const bad of ['', '0x', `0x${'a'.repeat(63)}`, `0x${'a'.repeat(65)}`, `0x${'z'.repeat(64)}`, 'not a hash', `0x${'0'.repeat(64)}`]) {
      expect(normalize(bad), bad).toBeNull()
    }
  })
})

describe('marks', () => {
  // A mismatch means the derivation changed.
  const VECTORS: Array<[string, number[], string]> = [
    [`0x${'f'.repeat(64)}`, [52, 60, 34, 33, 46, 61, 22, 33, 18, 40], 'ribbon, drops, caramel, chocolate, padlock, cherry, antenna, chocolate, pill, key'],
    ['0xe0e486cadd1b2ce95a6105f8168186ffeb9af4241e7b4aa718c14c7430f8aaed', [57, 1, 27, 29, 42, 7, 18, 55, 39, 38], 'tongue, seat, fire, hammer, moon, candle, pill, bed, hourglass, rose'],
    ['0x4711b487307aad94bce62e9b750db086c54d3c22176e315979984abd38701396', [8, 14, 26, 24, 53, 63, 19, 4, 51, 26], 'sock, door, hand, hole, dress, heart, feather, wave, ear, hand'],
  ]

  it('match the reference vectors, index and name', async () => {
    for (const [hash, indices, names] of VECTORS) {
      const got = await marks(hash)
      expect(got, hash).toEqual(indices)
      expect(got.map((i) => NAMES[i]).join(', '), hash).toBe(names)
    }
  })

  it('read the whole hash: changing the last character changes them', async () => {
    const head = '0xe0e486cadd1b2ce95a6105f8168186ffeb9af4241e7b4aa718c14c7430f8aae'
    expect(await marks(`${head}d`)).not.toEqual(await marks(`${head}e`))
  })

  it('are never derived from a bad hash', async () => {
    await expect(marks('not a hash')).rejects.toThrow(/32-byte/)
    await expect(marks(`0x${'0'.repeat(64)}`)).rejects.toThrow(/32-byte/)
  })

  it('are refused without WebCrypto, rather than derived by anything weaker', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true })
    try {
      await expect(marks(VECTORS[1]![0])).rejects.toBeInstanceOf(CannotRead)
      await expect(marks(VECTORS[1]![0])).rejects.toThrow('This browser cannot read the Marks.')
    } finally {
      if (original) Object.defineProperty(globalThis, 'crypto', original)
    }
  })
})

describe('the derivation constants', () => {
  it('make an offline grind expensive', () => {
    // 60 bits of code, at an iteration count far above OWASP's PBKDF2-SHA-256 floor.
    expect(COUNT * 6).toBe(60)
    expect(ITERATIONS).toBe(4_000_000)
  })

  it('are domain-separated and versioned', () => {
    expect(PREFIX).toBe('socklove.eth:check:v1:')
    expect(SALT).toBe('socklove.eth:check:v1:salt')
  })
})
