import { createHash } from 'node:crypto'

/**
 * Sets script-src and style-src to the inline hashes, and font-src and img-src
 * to data: alone, since a built page loads nothing from its origin. Re-run after
 * any edit.
 */
export function lockCsp(html, label = 'page') {
  const hash = (body) => `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`
  const bodies = (tag) =>
    [...html.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi'))].map((m) => m[1])
  const scripts = bodies('script').map(hash)
  const styles = bodies('style').map(hash)
  if (!scripts.length) throw new Error(`${label}: no inline script to hash`)
  if (!styles.length) throw new Error(`${label}: no inline style to hash`)

  let locked = false
  const out = html.replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/i, (_, open, csp, close) => {
    locked = true
    return (
      open +
      csp
        .replace(/script-src [^;]+/, `script-src ${scripts.join(' ')}`)
        .replace(/style-src [^;]+/, `style-src ${styles.join(' ')}`)
        .replace(/(font-src|img-src) [^;]+/g, '$1 data:') +
      close
    )
  })
  if (!locked) throw new Error(`${label}: no Content-Security-Policy to lock`)
  return out
}

export function cspScriptHashes(html) {
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/i)
  const src = csp?.[1].match(/script-src ([^;]+)/)
  return src ? [...src[1].matchAll(/'sha256-[^']+'/g)].map((m) => m[0]) : []
}
