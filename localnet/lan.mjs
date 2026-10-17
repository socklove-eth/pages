/**
 * Stages a 1-of-1 chain and serves the built pages over the LAN, so the whole
 * flow can be driven on two real devices.
 *
 *   anvil --silent --host 0.0.0.0 &
 *   node localnet/lan.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { fileURLToPath } from 'node:url'
import { lockCsp } from '../scripts/csp.mjs'
import { rpcUrls } from '../scripts/env.mjs'
import { serve } from '../scripts/serve.mjs'

const PORT = Number(process.env.PORT ?? 4177)
const here = (p) => fileURLToPath(new URL(p, import.meta.url))

/**
 * Rewrites every baked-in endpoint to `local`, lets the CSP reach its origin
 * (a LAN address is neither https nor loopback), and re-locks the CSP, whose
 * script hash the rewrite invalidates. Throws unless one was found and none survives.
 */
export function patchAltar(html, local, urls = rpcUrls(here('..'))) {
  let out = html
  let hit = 0
  for (const url of urls) {
    if (out.includes(url)) {
      hit++
      out = out.replaceAll(url, local)
    }
  }
  if (hit === 0) throw new Error('no baked-in RPC endpoint found in the built page')
  const list = out.match(/\bRPC_URLS\s*=\s*\[([\s\S]*?)\]/)
  if (!list) throw new Error('RPC_URLS not found in the built page')
  const survivors = [...list[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]).filter((u) => u !== local)
  if (survivors.length) throw new Error(`endpoints survived the patch: ${[...new Set(survivors)].join(', ')}`)
  const origin = new URL(local).origin
  const opened = out.replace(/(<meta http-equiv="Content-Security-Policy" content="[^"]*?connect-src [^;"]+)/, `$1 ${origin}`)
  if (opened === out) throw new Error('connect-src not found in the built page')
  return { html: lockCsp(opened, 'altar'), hit }
}

/** Returns Sigil unpatched; throws unless its CSP still forbids the network. */
export function checkSigil(html) {
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)
  if (!csp || !/default-src\s+'none'/.test(csp[1])) throw new Error("sigil lacks default-src 'none'")
  return html
}

/** An IPv4 address other devices on the LAN can reach. */
function lanAddress() {
  const virtual = /^(docker|br-|veth|virbr|vmnet|vboxnet|tun|tap|zt|wg)/
  const candidates = Object.entries(networkInterfaces())
    .filter(([iface]) => !virtual.test(iface))
    .flatMap(([iface, list]) => (list ?? []).filter((n) => n.family === 'IPv4' && !n.internal).map((n) => ({ iface, address: n.address })))
  return (candidates.find((c) => /^(wl|en|eth)/.test(c.iface)) ?? candidates[0])?.address ?? '127.0.0.1'
}

async function main() {
  const { encodeQR } = await import('qr')
  const { OWNER_A, OWNER_B, setupChain } = await import('./stage.mjs')
  const host = lanAddress()
  const dir = here('../dist/lan/')

  console.log('\nStaging a 1-of-1 chain…\n')
  const stage = await setupChain()
  console.log(`  Safe          ${stage.safe}`)

  const { html, hit } = patchAltar(readFileSync(here('../dist/altar/index.html'), 'utf8'), `http://${host}:8545`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(`${dir}altar.html`, html)
  writeFileSync(`${dir}sigil.html`, checkSigil(readFileSync(here('../dist/sigil/index.html'), 'utf8')))

  const url = `http://${host}:${PORT}/altar.html`
  serve(dir, PORT, { host: '0.0.0.0' })
  process.on('SIGINT', () => process.exit(0))

  console.log(`\n  Altar, with ${hit} endpoints rewritten to this chain:`)
  console.log(encodeQR(url, 'term'))
  console.log(`  ${url}`)
  console.log(`  http://${host}:${PORT}/sigil.html`)
  console.log('\n  Wallet network, on both devices')
  console.log(`    RPC        http://${host}:8545`)
  console.log('    chain id   31337')
  console.log(`    owner A    ${OWNER_A.address}  (anvil account 0)`)
  console.log(`    owner B    ${OWNER_B.address}  (anvil account 1)`)
  console.log('\n  On a phone, scan from inside the wallet\'s own browser.')
  console.log('  Ctrl-C to stop.\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error('\nlan failed:', e.shortMessage || e.message)
    process.exitCode = 1
  })
}
