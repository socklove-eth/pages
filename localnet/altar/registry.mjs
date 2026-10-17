/** The rpc.endpoints record. */
import { toHex } from 'viem'
import { RPC_ENDPOINTS_TEXT_KEY } from '../../src/altar/lib/registry.ts'
import {
  ENS_NODE, ENS_REGISTRY_WITH_FALLBACK, ENS_REGISTRY_WITH_FALLBACK_FULL_ABI, ENS_PUBLIC_RESOLVER, ENS_PUBLIC_RESOLVER_FULL_ABI, RPC, mined, pub, wallet,
} from '../stage.mjs'
import { check, until } from '../check.mjs'
import {
  URL_BASE, BAKED, BAKED_ORIGIN, SEPOLIA, open, doc, text, notice, noticeFor, stubRpc,
} from './harness.mjs'

export async function registry() {
  console.log('\nThe Living Registry')
  // The baked set's first endpoint and a public name the record gives both reach the local chain; the rest fail.
  const NAMED = 'https://named.example'
  const route = { [BAKED_ORIGIN]: RPC, [NAMED]: RPC }
  const setRecord = async (value) => {
    const owner = await pub.readContract({ address: ENS_REGISTRY_WITH_FALLBACK, abi: ENS_REGISTRY_WITH_FALLBACK_FULL_ABI, functionName: 'owner', args: [ENS_NODE] })
    await pub.request({ method: 'anvil_impersonateAccount', params: [owner] })
    await pub.request({ method: 'anvil_setBalance', params: [owner, toHex(10n ** 18n)] })
    await mined(await wallet(owner).writeContract({
      address: ENS_PUBLIC_RESOLVER, abi: ENS_PUBLIC_RESOLVER_FULL_ABI, functionName: 'setText', args: [ENS_NODE, RPC_ENDPOINTS_TEXT_KEY, value],
    }))
    await pub.request({ method: 'anvil_stopImpersonatingAccount', params: [owner] })
  }
  const boot = async (opts) => {
    const hosts = new Set()
    const dom = open(URL_BASE, null, {}, { rpc: null, route, hosts, ...opts })
    await until(() => /Ring|Ask her/.test(text(dom)), 60000)
    return { dom, hosts, notice: notice(dom) }
  }
  const BAKED_HOST = new URL(BAKED).host
  const NAMED_HOST = new URL(NAMED).host

  const bare = await boot()
  check('with no record, the baked set serves and the notice names it',
    bare.notice === noticeFor(BAKED_HOST) && !bare.hosts.has(NAMED_HOST), bare.notice)

  await setRecord(`${NAMED}, ftp://nowhere`)
  const moved = await boot()
  check('a record moves the page to the endpoints it names',
    await until(() => moved.hosts.has(NAMED_HOST)), [...moved.hosts].join(','))
  check('and the notice names the endpoint answering now, alone',
    await until(() => notice(moved.dom) === noticeFor(NAMED_HOST)), notice(moved.dom))
  const host = doc(moved.dom).querySelector('.page-notice [data-copy]')
  check('its host a copy target like the hash, and nothing else to press',
    host?.textContent === NAMED_HOST && host.getAttribute('data-copy') === NAMED_HOST
      && host.className === 'inscription'
      && !doc(moved.dom).querySelector('.page-notice a, .page-notice button'))
  check('and named for screen readers and titled Copy',
    host?.getAttribute('aria-label') === 'Copy the RPC endpoint' && host.getAttribute('title') === 'Copy')

  const kept = await boot({ rpc: RPC })
  check('a supplied endpoint is kept: the record is not followed',
    !kept.hosts.has(NAMED_HOST) && kept.notice === noticeFor(new URL(RPC).host), kept.notice)

  const sepoliaNamed = await stubRpc(() => SEPOLIA)
  await setRecord(NAMED)
  const elsewhere = await boot({ route: { ...route, [NAMED]: sepoliaNamed.url } })
  check('a record endpoint on another chain is passed over, the baked set kept',
    await until(() => notice(elsewhere.dom) === noticeFor(BAKED_HOST)) && /Ring|Ask her/.test(text(elsewhere.dom)), notice(elsewhere.dom))
  sepoliaNamed.server.close()

  await setRecord('http://10.0.0.1:8545, not a url')
  const refused = await boot()
  check('a record naming nothing usable keeps the baked set', refused.notice === noticeFor(BAKED_HOST), refused.notice)

  // The chain claims to be local, yet a record naming this machine is still dropped.
  await setRecord(RPC.replace('127.0.0.1', 'localhost'))
  const localRecord = await boot()
  check('a record naming loopback is dropped, whatever chain is claimed', localRecord.notice === noticeFor(BAKED_HOST), localRecord.notice)

  await setRecord('')
}
