import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { cspScriptHashes, lockCsp } from './csp.mjs'

const SOURCE_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "font-src 'self' data:; img-src 'self' data:; base-uri 'none'"
const page = (script = 'var a = 1', style = 'body{}', csp = SOURCE_CSP) =>
  `<head><meta http-equiv="Content-Security-Policy" content="${csp}"><style>${style}</style></head>` +
  `<body><script>${script}</script></body>`
const sha = (body: string) => `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`

describe('lockCsp', () => {
  it('replaces script-src and style-src with the hashes of the inline bodies', () => {
    const out = lockCsp(page())
    expect(out).toContain(`script-src ${sha('var a = 1')};`)
    expect(out).toContain(`style-src ${sha('body{}')};`)
    expect(out).not.toContain("'unsafe-inline'")
  })

  it('narrows font-src and img-src to data:', () => {
    const out = lockCsp(page())
    expect(out).toContain('font-src data:;')
    expect(out).toContain('img-src data:;')
    expect(out).not.toContain("'self'")
  })

  it('hashes every inline script, in order', () => {
    const html = page().replace('</body>', '<script>var b = 2</script></body>')
    expect(cspScriptHashes(lockCsp(html))).toEqual([sha('var a = 1'), sha('var b = 2')])
  })

  it('leaves everything outside the policy untouched', () => {
    const html = page()
    expect(lockCsp(html).replace(/content="[^"]*"/, '')).toBe(html.replace(/content="[^"]*"/, ''))
  })

  it('throws without an inline script, an inline style or a policy', () => {
    expect(() => lockCsp(page().replace(/<script>.*<\/script>/, ''), 'x')).toThrow('x: no inline script to hash')
    expect(() => lockCsp(page().replace(/<style>.*<\/style>/, ''), 'x')).toThrow('x: no inline style to hash')
    expect(() => lockCsp(page().replace(/<meta[^>]*>/, ''), 'x')).toThrow('x: no Content-Security-Policy to lock')
  })

  it('adds no script-src or style-src to a policy that has none', () => {
    expect(lockCsp(page('var a = 1', 'body{}', "default-src 'none'"))).toBe(page('var a = 1', 'body{}', "default-src 'none'"))
  })
})

describe('cspScriptHashes', () => {
  it('reads nothing from a page without a policy', () => {
    expect(cspScriptHashes('<p>no policy</p>')).toEqual([])
  })

  it('reads the hashes from a hand-written policy, and nothing from one without script-src', () => {
    const csp = "default-src 'none'; script-src 'sha256-AAA=' 'sha256-BBB='; style-src 'sha256-CCC='"
    expect(cspScriptHashes(page('', '', csp))).toEqual(["'sha256-AAA='", "'sha256-BBB='"])
    expect(cspScriptHashes(page('', '', "default-src 'none'"))).toEqual([])
  })
})
