/**
 * Checks lan.mjs against the built pages: every baked-in endpoint is
 * rewritten, and Sigil is served only with its CSP network ban intact.
 *
 *   node localnet/lan-check.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { checkSigil, patchAltar } from './lan.mjs'
import { cspScriptHashes, lockCsp } from '../scripts/csp.mjs'
import { rpcUrls } from '../scripts/env.mjs'
import { check, report } from './check.mjs'

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')
const ALTAR = read('../dist/altar/index.html')
const SIGIL = read('../dist/sigil/index.html')
const LOCAL = 'http://192.0.2.1:8545'

const throws = (fn, pattern) => {
  try { fn() } catch (e) { return pattern.test(e.message) }
  return false
}

const urls = rpcUrls(fileURLToPath(new URL('..', import.meta.url)))
console.log('\nThe Altar patch')
check('the built Altar carries every endpoint .env names', urls.every((u) => ALTAR.includes(u)),
  urls.filter((u) => !ALTAR.includes(u)).join(', '))

const { html, hit } = patchAltar(ALTAR, LOCAL, urls)
check('every endpoint is rewritten', hit === urls.length, `${hit} of ${urls.length}`)
check('no endpoint survives anywhere in the page', urls.every((u) => !html.includes(u)),
  urls.filter((u) => html.includes(u)).join(', '))
check('the page now reads the local chain', html.match(/\bRPC_URLS\s*=\s*\[([\s\S]*?)\]/)?.[1].includes(LOCAL) === true)
const connectSrc = (page) => page.match(/http-equiv="Content-Security-Policy" content="[^"]*?connect-src ([^;"]+)/)?.[1] ?? ''
const connect = connectSrc(html)
check('and its policy lets it reach that chain', connect.split(/\s+/).includes(new URL(LOCAL).origin), connect)
check('the policy is otherwise the built one', connect === `${connectSrc(ALTAR)} ${new URL(LOCAL).origin}`, connect)
// The patch changes hashed script bytes; without re-locking the CSP the page is blank.
check('the policy names the hash of the bytes the page now holds',
  JSON.stringify(cspScriptHashes(html)) === JSON.stringify(cspScriptHashes(lockCsp(html, 'altar'))),
  cspScriptHashes(html).join(' '))
check('and that hash is not the one the unpatched page carried',
  cspScriptHashes(html)[0] !== cspScriptHashes(ALTAR)[0])

check('a page still carrying an unknown endpoint is refused',
  throws(() => patchAltar(ALTAR, LOCAL, urls.slice(1)), /survived/))
check('a page carrying none of the endpoints is refused',
  throws(() => patchAltar('<script>var RPC_URLS = ["https://x.example"]</script>', LOCAL, urls), /no baked-in/))
check('a page without RPC_URLS is refused',
  throws(() => patchAltar(`<script>"${urls[0]}"</script>`, LOCAL, urls), /RPC_URLS not found/))

console.log('\nThe Sigil copy')
check("the built Sigil passes with default-src 'none'", checkSigil(SIGIL) === SIGIL)
check("a Sigil without default-src 'none' is refused",
  throws(() => checkSigil(SIGIL.replace(/(http-equiv="Content-Security-Policy" content=")default-src 'none'/, "$1default-src 'self'")), /default-src/))

// Licence notices embedded in bundled sources, invisible to package manifests.
console.log('\nLicence notices')
for (const who of ['Paul Miller', 'noble', 'SIL OPEN FONT LICENSE']) {
  check(`Altar names ${who}`, ALTAR.includes(who))
}
check('Sigil names the font licence', SIGIL.includes('SIL OPEN FONT LICENSE'))

report()
