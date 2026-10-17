/**
 * Fails when a locked package was published less than `days` ago. `npm ci`
 * installs the lockfile as it stands, so the .npmrc cooldown alone does not
 * cover it.
 *
 *   node scripts/age.mjs [days]
 */
import { readFileSync } from 'node:fs'

/** Every registry name@version in a v3 lockfile; the root and linked local packages excluded. */
export function lockedVersions(lock) {
  const seen = new Map()
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (!path || entry.link || !entry.version) continue
    const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length)
    seen.set(`${name}@${entry.version}`, { name, version: entry.version })
  }
  return [...seen.values()]
}

/** The locked versions published after `now - days`, or with no known date. */
export function tooYoung(versions, published, now, days) {
  const cutoff = now - days * 86_400_000
  return versions.filter(({ name, version }) => {
    const at = Date.parse(published[name]?.[version] ?? '')
    return Number.isNaN(at) || at > cutoff
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const days = Number(process.argv[2] ?? 7)
  const versions = lockedVersions(JSON.parse(readFileSync('package-lock.json', 'utf8')))
  const published = {}
  for (const name of new Set(versions.map((v) => v.name))) {
    const res = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2F')}`)
    if (!res.ok) throw new Error(`registry answered ${res.status} for ${name}`)
    published[name] = (await res.json()).time
  }
  const young = tooYoung(versions, published, Date.now(), days)
  for (const v of young) console.error(`younger than ${days} days: ${v.name}@${v.version}`)
  console.log(`${versions.length} locked versions, ${young.length} too young`)
  if (young.length) process.exit(1)
}
