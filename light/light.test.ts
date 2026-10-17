import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// light.css reads no other file, so it and this test can move together.
const css = readFileSync(resolve(process.cwd(), 'light', 'light.css'), 'utf-8')
const tokens = css.match(/:root \{[\s\S]*?\n\}/)![0]
const rules = css.replace(tokens, '').replace(/\/\*[\s\S]*?\*\//g, '')
const blocks = [...rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]?.trim() ?? '', body: m[2] ?? '' }))

describe('light.css', () => {
  it('defines ten colour tokens and one gradient', () => {
    const names = [...tokens.matchAll(/^\s*--([a-z]+):/gm)].map((m) => m[1])
    expect(names).toEqual(['night', 'ink', 'spark', 'candle', 'heart', 'flame', 'bond', 'crossing', 'seal', 'thorn', 'spectrum'])
  })

  it('orders the gradient', () => {
    expect(tokens).toMatch(/--spectrum: [^;]*var\(--candle\)[^;]*var\(--heart\)[^;]*var\(--flame\)[^;]*var\(--bond\)[^;]*var\(--crossing\)/)
  })

  it('defines the shared classes', () => {
    for (const rule of ['.step {', '.vow {', '.way {', '.crossroads {', '.quill {', '.quill:focus {', '.quill.pricked {', '.inscription {', '.inscription.sealed::after {', '.thorn {', '.bond {']) {
      expect(css).toContain(rule)
    }
  })

  it('puts the invalid-input state after the focus state', () => {
    expect(css.indexOf('.quill.pricked {')).toBeGreaterThan(css.indexOf('.quill:focus {'))
  })

  it('places nothing: a surface sets its own margins', () => {
    expect(rules).not.toMatch(/margin(-top|-bottom)?\s*:/)
  })

  it('sets --carved to Cinzel and --spoken to Outfit', () => {
    expect(css).toMatch(/--carved:[^;]*'Cinzel'/)
    expect(css).toMatch(/--spoken:[^;]*'Outfit'/)
  })

  it('reads no other file', () => {
    expect(css).not.toMatch(/url\(|@import/)
  })

  it('has no colour literal outside the tokens', () => {
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i)
  })

  it('uses --heart and --flame only on the signing button', () => {
    for (const { selector, body } of blocks) {
      if (/var\(--(heart|flame)\)/.test(body)) expect(selector).toContain('.vow')
    }
  })

  it('uses --bond only on .bond', () => {
    expect(blocks.filter(({ body }) => body.includes('var(--bond)')).map(({ selector }) => selector)).toEqual(['.bond'])
  })
})
