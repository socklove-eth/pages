import { describe, it, expect } from 'vitest'
import { audit } from './audit.mjs'

const CSP_SCRIPT = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-AAA='; require-trusted-types-for 'script'; trusted-types 'none'">`
const CSP_UNSAFE = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; require-trusted-types-for 'script'; trusted-types 'none'">`
const BUNDLE = 'x'.repeat(600)
const NOTICES = '<!--\nMIT License\n\n---\n\nSIL OPEN FONT LICENSE Version 1.1\n-->'

const page = ({ head = CSP_SCRIPT, body = '', script = `<script>${BUNDLE}</script>`, notices = NOTICES } = {}) =>
  `<!doctype html><html><head>${head}<style>body{background:url('data:image/png;base64,AA')}</style>` +
  `<link rel="icon" href="data:image/svg+xml;base64,AA"></head><body>${body}` +
  `<img src="data:image/png;base64,AA"><a href="#top">top</a>${script}</body></html>${notices}`

describe('audit', () => {
  it('passes a self-contained page', () => {
    expect(audit(page())).toEqual([])
  })

  it('reports a page that carries no licence notices', () => {
    expect(audit(page({ notices: '' }))).toEqual(['no licence notices'])
  })

  it('reports an external src', () => {
    expect(audit(page({ body: '<img src="https://example.com/a.png">' }))).toEqual([
      'external reference: https://example.com/a.png',
    ])
  })

  it('reports an external href, including an outbound link', () => {
    expect(audit(page({ body: '<a href="https://example.com">x</a>' }))).toEqual(['external reference: https://example.com'])
    expect(audit(page({ body: '<a href="mailto:a@b.c">x</a>' }))).toEqual(['external reference: mailto:a@b.c'])
    expect(audit(page({ body: '<a href="../other.html">x</a>' }))).toEqual(['external reference: ../other.html'])
  })

  it('reports an external CSS url()', () => {
    expect(audit(page({ body: '<div style="background:url(https://example.com/a.png)"></div>' }))).toEqual([
      'external CSS url(): https://example.com/a.png',
    ])
  })

  it.each([
    ['a meta refresh', '<meta http-equiv="refresh" content="0;url=https://example.com">', 'meta refresh'],
    ['a srcset', '<img srcset="data:image/png;base64,AA 1x, https://example.com/b.png 2x">', 'external reference: https://example.com/b.png'],
    ['an object data', '<object data="https://example.com/o"></object>', 'external reference: https://example.com/o'],
    ['a video poster', '<video poster="https://example.com/p.png"></video>', 'external reference: https://example.com/p.png'],
    ['a single-quoted src', "<img src='https://example.com/q.png'>", 'external reference: https://example.com/q.png'],
    ['an unquoted href', '<a href=https://example.com/u>u</a>', 'external reference: https://example.com/u'],
    ['a CSS @import', '<style>@import "https://example.com/i.css";</style>', 'external CSS @import: https://example.com/i.css'],
    ['an imagesrcset', '<link rel="preload" as="image" imagesrcset="https://example.com/p.png 1x">', 'external reference: https://example.com/p.png'],
    ['a srcdoc', '<iframe srcdoc="<b>x</b>"></iframe>', 'srcdoc on <iframe>'],
    ['a CSS escape', '<div style="background:u\\72l(https://example.com/e.png)"></div>', 'external CSS escape in CSS'],
    ['an image-set()', '<div style=\'background:image-set("https://example.com/s.png" 1x)\'></div>', 'external CSS image-set(): https://example.com/s.png'],
    ['an SVG animation writing href', '<svg><set attributeName="href" to="https://example.com/a"/></svg>', 'external reference: https://example.com/a'],
  ])('reports %s', (_, body, problem) => {
    expect(audit(page({ body }))).toContain(problem)
  })

  it('ignores a same-document url(#id)', () => {
    expect(audit(page({ body: '<svg><rect fill="url(#g)"/></svg>' }))).toEqual([])
  })

  it('reports an un-inlined stylesheet', () => {
    expect(audit(page({ head: `${CSP_SCRIPT}<link rel="stylesheet" href="page.css">` }))).toEqual([
      'external reference: page.css',
      'un-inlined stylesheet',
    ])
  })

  it('reports an external script', () => {
    expect(audit(page({ script: `<script src="app.js"></script><script>${BUNDLE}</script>` }))).toEqual([
      'external reference: app.js',
      'external script',
    ])
  })

  it('reports an unreplaced directive', () => {
    expect(audit(page({ body: '<!--PAGE:LOGIC-->' }))).toEqual(['unreplaced directive: <!--PAGE:LOGIC'])
  })

  it('ignores a directive written inside a script, but not the comment opener itself', () => {
    expect(audit(page({ script: `<script>// <!--PAGE:LOGIC-->${BUNDLE}</script>` }))).toEqual(['inlined script contains <!--'])
  })

  it("reports a CSP carrying 'unsafe-inline'", () => {
    expect(audit(page({ head: CSP_UNSAFE }))).toEqual([
      "CSP carries 'unsafe-inline'",
    ])
  })

  it('reports an inlined bundle that could close its own script element', () => {
    expect(audit(page({ script: `<script>var s = "</script >"${BUNDLE}</script>` }))).toEqual([
      '1 <script and 2 </script in the page',
      'inlined script contains </script',
    ])
  })

  it("reports a CSP that allows 'self'", () => {
    const head = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-AAA='; img-src 'self' data:; require-trusted-types-for 'script'; trusted-types 'none'">`
    expect(audit(page({ head }))).toEqual(["CSP allows 'self'"])
  })

  it('reports a page without its bundle', () => {
    expect(audit(page({ script: '<script>var a = 1</script>' }))).toEqual(['page built with no bundle'])
  })

  it('reports a CSP that lets script write HTML from strings', () => {
    const head = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-AAA='">`
    expect(audit(page({ head }))).toEqual([
      "CSP lacks require-trusted-types-for 'script'; trusted-types 'none'",
    ])
  })

  it('reports a CSP that allows a Trusted Types policy', () => {
    const head = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-AAA='; require-trusted-types-for 'script'; trusted-types lax">`
    expect(audit(page({ head }))).toEqual([
      "CSP lacks require-trusted-types-for 'script'; trusted-types 'none'",
    ])
  })

  it('reports a missing CSP', () => {
    expect(audit(page({ head: '' }))).toEqual(['no Content-Security-Policy'])
  })

  it("reports a CSP that does not start from default-src 'none'", () => {
    const head = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; require-trusted-types-for 'script'; trusted-types 'none'">`
    expect(audit(page({ head }))).toEqual(["CSP does not start from default-src 'none'"])
  })
})
