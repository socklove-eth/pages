import { JSDOM } from 'jsdom'

// Every attribute that can name a resource or a destination.
const URL_ATTRIBUTES = [
  'src', 'href', 'srcset', 'imagesrcset', 'data', 'poster', 'action', 'formaction', 'background',
  'cite', 'ping', 'longdesc', 'manifest', 'codebase', 'xlink:href',
  // SVG animation can write href at runtime.
  'to', 'from', 'by', 'values',
]
const local = (value) => /^\s*(#|data:)/i.test(value)

/** Every url(), image-set() and @import in a stylesheet or style attribute that is not data: or #. */
function cssReferences(css) {
  const found = []
  // An escape can spell url( without the letters; nothing inlined needs one.
  if (css.includes('\\')) found.push('escape in CSS')
  for (const m of css.matchAll(/image-set\(\s*['"]([^'"]+)['"]/gi)) if (!local(m[1])) found.push(`image-set(): ${m[1]}`)
  for (const m of css.matchAll(/url\(\s*['"]?([^)'"]+)['"]?\s*\)/gi)) if (!local(m[1])) found.push(`url(): ${m[1]}`)
  for (const m of css.matchAll(/@import\s+(?:url\()?\s*['"]?([^'")\s;]+)/gi)) found.push(`@import: ${m[1]}`)
  return found
}

/** Returns what makes a built page not self-contained; empty means it is. */
export function audit(html) {
  const problems = []
  // Parsed, not pattern-matched: quoting, srcset and CSS cannot hide a reference.
  const document = new JSDOM(html).window.document

  for (const el of document.querySelectorAll('*')) {
    for (const name of URL_ATTRIBUTES) {
      const value = el.getAttribute(name)
      if (value === null) continue
      const values = /srcset$/.test(name) ? value.split(',').map((c) => c.trim().split(/\s+/)[0] ?? '') : [value]
      for (const v of values) if (!local(v)) problems.push(`external reference: ${v}`)
    }
    const style = el.getAttribute('style')
    if (style) for (const ref of cssReferences(style)) problems.push(`external CSS ${ref}`)
  }
  for (const el of document.querySelectorAll('style')) {
    for (const ref of cssReferences(el.textContent ?? '')) problems.push(`external CSS ${ref}`)
  }
  for (const el of document.querySelectorAll('meta[http-equiv]')) {
    if (/^refresh$/i.test(el.getAttribute('http-equiv') ?? '')) problems.push('meta refresh')
  }
  for (const el of document.querySelectorAll('[srcdoc]')) problems.push(`srcdoc on <${el.tagName.toLowerCase()}>`)

  // Strip script bodies: bundle text is not markup.
  const markup = html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, (_, open) => `${open}</script>`)
  if (/<link[^>]+rel="stylesheet"/i.test(markup)) problems.push('un-inlined stylesheet')
  if (/<script[^>]+\bsrc=/i.test(markup)) problems.push('external script')

  const left = markup.match(/<!--\s*PAGE:[A-Z]+/g)
  if (left) problems.push(`unreplaced directive: ${left.join(', ')}`)

  if (!/<script>[\s\S]{500,}<\/script>/.test(html)) problems.push('page built with no bundle')

  // A pinned page has no response headers; the <meta> CSP is its only policy.
  const csp = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)
  if (!csp) problems.push('no Content-Security-Policy')
  else if (!/default-src 'none'/.test(csp[1])) problems.push("CSP does not start from default-src 'none'")
  else if (/'unsafe-inline'/.test(csp[1])) problems.push("CSP carries 'unsafe-inline'")
  else if (/'self'/.test(csp[1])) problems.push("CSP allows 'self'")

  // No policy may exist, so no script can turn a string into HTML.
  if (csp && !(/require-trusted-types-for 'script'/.test(csp[1]) && /trusted-types 'none'(;|$)/.test(csp[1]))) {
    problems.push("CSP lacks require-trusted-types-for 'script'; trusted-types 'none'")
  }

  // Either sequence inside an inlined script would break out of its element.
  const inlined = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])
  const openTags = (html.match(/<script\b/gi) ?? []).length
  const closeTags = (html.match(/<\/script/gi) ?? []).length
  if (openTags !== closeTags) problems.push(`${openTags} <script and ${closeTags} </script in the page`)
  for (const body of inlined) {
    if (/<\/\s*script/i.test(body)) problems.push('inlined script contains </script')
    if (body.includes('<!--')) problems.push('inlined script contains <!--')
  }
  if (!/<!--[\s\S]*\bMIT License\b[\s\S]*\bSIL OPEN FONT LICENSE\b[\s\S]*-->/.test(html)) {
    problems.push('no licence notices')
  }
  return problems
}
