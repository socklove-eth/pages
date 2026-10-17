/** The shell every page must carry, checked on each page build.mjs declares. */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = process.cwd()

/** Page names from build.mjs's PAGES array. */
function declaredPages(): string[] {
  const src = readFileSync(resolve(root, 'build.mjs'), 'utf-8')
  const start = src.indexOf('const PAGES = [')
  const end = src.indexOf('\n]', start)
  // A rename must fail here rather than widen the scan to the whole file.
  if (start < 0 || end < start) throw new Error('build.mjs declares no PAGES array')
  return [...src.slice(start, end).matchAll(/name:\s*'([a-z]+)'/g)].map((m) => m[1]!)
}

const pages = declaredPages()
const source = (name: string) =>
  readFileSync(resolve(root, `src/${name}/index.html`), 'utf-8')

/** The page and every script it builds from, tests excluded. */
function code(name: string): string {
  const dir = resolve(root, `src/${name}`)
  const files = readdirSync(dir, { recursive: true, encoding: 'utf-8' })
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  return [source(name), ...files.map((f) => readFileSync(join(dir, f), 'utf-8'))].join('\n')
}

describe('PAGES', () => {
  it('declares at least one page, and each has a source', () => {
    expect(pages.length).toBeGreaterThan(0)
    for (const name of pages) expect(() => source(name)).not.toThrow()
  })
})

describe.each(pages)('%s — the shell', (name) => {
  const html = source(name)

  it('is one document with exactly one H1, and it is the page title', () => {
    expect(html.match(/<h1/g) ?? []).toHaveLength(1)
    expect(html).toMatch(/<h1 class="page-title">/)
  })

  it('opens with the logo, at the shared path', () => {
    expect(html).toMatch(/<img class="page-logo" src="\.\.\/\.\.\/logo\.png" alt="SockLove">/)
  })

  it('links the shared stylesheet and carries no <style> of its own', () => {
    expect(html).toMatch(/<link rel="stylesheet" href="\.\.\/\.\.\/page\.css">/)
    expect(html).not.toMatch(/<style[\s>]/)
  })

  it('carries the favicon directive for the build to replace', () => {
    expect(html).toMatch(/<!--\s*PAGE:FAVICON\s*-->/)
  })

  it('declares a Content-Security-Policy that starts from nothing', () => {
    expect(html).toMatch(/http-equiv="Content-Security-Policy"/)
    expect(html).toMatch(/default-src 'none'/)
  })

  it('lets no script write HTML from a string', () => {
    expect(html).toMatch(/require-trusted-types-for 'script'; trusted-types 'none'/)
  })

  it('never leaks a referrer', () => {
    expect(html).toMatch(/<meta name="referrer" content="no-referrer">/)
  })

  it('has the head a page needs', () => {
    expect(html).toMatch(/<meta charset="utf-8">/)
    expect(html).toMatch(/<meta name="viewport"/)
    expect(html).toMatch(/<meta name="theme-color" content="#000000">/)
    expect(html).toMatch(/<html lang="en">/)
  })

  it('has a title, og:title and description', () => {
    expect(html).toMatch(/<title>[A-Z][a-z]+ — SockLove<\/title>/)
    expect(html).toMatch(/<meta property="og:title"/)
    expect(html).toMatch(/<meta name="description"/)
  })

  it('is one centred column', () => {
    expect(html).toMatch(/<main class="page-main">/)
  })

  it('closes on the rule, the subtitle and the tagline', () => {
    expect(html).toMatch(/<div class="page-rule"><\/div>/)
    // The header sits above the scrolling main, not inside it.
    expect(html).toMatch(/<header class="page-header">/)
    expect(html.indexOf('<header class="page-header')).toBeLessThan(html.indexOf('<main class="page-main'))
    expect(html.indexOf('</header>')).toBeLessThan(html.indexOf('<main class="page-main'))
    expect(html).toMatch(/<p class="page-subtitle">/)
    expect(html).toMatch(/<footer class="page-footer">/)
    expect(html).toMatch(/<p class="page-tagline">Consent as Architecture<\/p>/)
  })

  // Every Page starts its middle at the same height, refusals included.
  it('draws its middle into one panel', () => {
    const main = html.slice(html.indexOf('<main class="page-main'), html.indexOf('</main>'))
    expect(main.match(/class="panel"/g)).toHaveLength(1)
  })

  it('discloses in the footer, under the tagline, or not at all', () => {
    const notice = html.match(/<p class="page-notice">([\s\S]*?)<\/p>/)
    if (!notice) return
    expect(html.indexOf('page-tagline')).toBeLessThan(html.indexOf('page-notice'))
    expect(notice[1]).not.toMatch(/<a |<button|data-copy/)
  })

  it('writes no path that begins with a slash', () => {
    // Only relative paths work under ipfs://, a gateway and an ENS name alike.
    expect(html).not.toMatch(/(?:src|href)="\//)
  })
})

// The rules a test can hold every page to: no way out, no frame, no shared gateway.
describe.each(pages)('%s — the standard', (name) => {
  const all = code(name)

  it('never navigates away and never opens a tab', () => {
    expect(all).not.toMatch(/<a[\s>]|\bh\('a'|createElement\('a'\)|target=|window\.open|location\.(assign|replace)\(|location\.href\s*=/)
  })

  it('refuses to run inside a frame, or on a shared path gateway', () => {
    expect(all).toMatch(/self !== top/)
    expect(all).toMatch(/ip\[fn\]s/)
  })
})

describe('altar — the notice', () => {
  it('is empty until an endpoint answers, so a Page that never runs claims nothing', () => {
    const html = readFileSync(resolve(root, 'src/altar/index.html'), 'utf-8')
    expect(html).toContain('<p class="page-notice"></p>')
  })
})

// page.css colours only through light.css tokens and leaves --heart, --flame
// and --bond to it; light.css has its own test.
describe('page.css and light.css', () => {
  const css = readFileSync(resolve(root, 'page.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '')

  it('links light.css before page.css on every page', () => {
    for (const name of pages) {
      const html = readFileSync(resolve(root, 'src', name, 'index.html'), 'utf-8')
      expect(html.indexOf('href="../../light/light.css"')).toBeGreaterThan(-1)
      expect(html.indexOf('href="../../light/light.css"')).toBeLessThan(html.indexOf('href="../../page.css"'))
    }
  })

  it('page.css has no colour literal', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i)
  })

  it('page.css does not use --heart, --flame or --bond', () => {
    expect(css).not.toMatch(/var\(--(heart|flame|bond)\)/)
  })
})

describe('sigil — the CSP', () => {
  it('declares a CSP with no network access, so a pasted hash cannot leave the page', () => {
    const csp = source('sigil').match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? ''
    expect(csp).toMatch(/^default-src 'none'/)
    expect(csp).not.toMatch(/connect-src/)
  })
})
