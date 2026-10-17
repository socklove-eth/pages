/** Reaching the chain: the endpoint prompt and what an endpoint may answer. */
import { encodeAbiParameters, pad, toHex } from 'viem'
import { foundry } from 'viem/chains'
import { CONFIG, ENS_PUBLIC_RESOLVER, RPC, OWNER_A, OWNER_B, SAFE, SAFE_FULL_ABI, pub, restageSingleOwner } from '../stage.mjs'
import { check, until } from '../check.mjs'
import {
  URL_BASE, BAKED_ORIGIN, SEPOLIA, open, doc, buttonName, text, status, notice, noticeFor, says, pressEnter, stubRpc, typeAndAsk, askAsA,
} from './harness.mjs'

const MOVED = `This Page no longer reads ${CONFIG.name}.`

/** The selector of the registry's resolver(bytes32). */
const RESOLVER_SELECTOR = '0x0178b8bf'
/** A 1-of-1 Safe, as getOwners, getThreshold and nonce answer. */
const SAFE_AT_ONE = {
  '0xa0e67e2b': encodeAbiParameters([{ type: 'address[]' }], [[OWNER_A.address]]),
  '0xe75235b8': pad('0x1'),
  '0xaffed0e0': pad('0x0'),
}

export async function reaching() {
  console.log('\nReaching the chain')
  const DEAD_RPC = 'http://127.0.0.1:1'
  const noRpc = open(URL_BASE, OWNER_A, {}, { rpc: null })
  check('its own endpoints all failing: "No public RPC endpoint was reached." under Connect',
    await says(noRpc, 'Enter your own RPC endpoint:', 60000)
      && [...doc(noRpc).querySelectorAll('#panel .thorn')].map((e) => e.textContent).join('|') === 'No public RPC endpoint was reached.'
      && status(noRpc) === 'No public RPC endpoint was reached.', text(noRpc))
  check('the prompt reads exactly so',
    doc(noRpc).querySelector('#panel .lead')?.textContent === 'Enter your own RPC endpoint:'
      && doc(noRpc).querySelector('label[for="rpc"]')?.textContent === 'RPC endpoint'
      && doc(noRpc).getElementById('rpc')?.getAttribute('placeholder') === 'Insert RPC endpoint…'
      && buttonName(doc(noRpc).getElementById('retry')) === 'Connect')
  check('Connect shows 🔌, hidden from screen readers',
    doc(noRpc).querySelector('#retry .symbol[aria-hidden="true"]')?.textContent === '🔌', doc(noRpc).getElementById('retry')?.textContent)
  doc(noRpc).getElementById('rpc').dispatchEvent(new noRpc.window.Event('input'))
  check('typing an endpoint clears the line under it', status(noRpc) === '', status(noRpc))

  const lost = open(URL_BASE, OWNER_A, {}, { rpc: DEAD_RPC })
  check('a kept endpoint that fails on load: "Your RPC endpoint was not reached." under Connect',
    await says(lost, 'Enter your own RPC endpoint:', 60000) && status(lost) === 'Your RPC endpoint was not reached.'
      && doc(lost).getElementById('rpc')?.value === '', text(lost))
  check('its field shows the thorn', doc(lost).getElementById('rpc')?.classList.contains('pricked'))
  check('and is marked invalid for a screen reader', doc(lost).getElementById('rpc')?.getAttribute('aria-invalid') === 'true')
  check('and it is forgotten for the tab', lost.window.sessionStorage.getItem('rpc') === null)

  doc(lost).getElementById('rpc').value = DEAD_RPC
  doc(lost).getElementById('retry').click()
  check('the same endpoint typed and connected: refused silently, the field marked',
    await says(lost, 'Enter your own RPC endpoint:', 60000) && status(lost) === ''
      && !doc(lost).querySelector('#panel .thorn') && doc(lost).getElementById('rpc')?.classList.contains('pricked')
      && lost.window.sessionStorage.getItem('rpc') === null, text(lost))
  check('and the field takes the focus, so a screen reader hears it refused', doc(lost).activeElement?.id === 'rpc')

  const field = () => doc(lost).getElementById('rpc')
  const refused = (value, press) => {
    field().value = value
    press()
    return field().value === '' && field().classList.contains('pricked') && status(lost) === ''
      && lost.window.sessionStorage.getItem('rpc') === null
  }
  check('an invalid URL empties the field, shows the thorn and says nothing',
    refused('not a url', () => doc(lost).getElementById('retry').click()))
  check('Enter presses Connect, and a non-http URL is refused the same way',
    refused('ftp://127.0.0.1:8545', () => pressEnter(lost, 'rpc')))
  check('plain http off this machine is refused: the page could never reach it',
    refused('http://rpc.example:8545', () => doc(lost).getElementById('retry').click()))

  field().value = RPC
  doc(lost).getElementById('retry').click()
  check('a working endpoint boots the page', await says(lost, 'She said yes. The 💍 Ring is whole', 30000), text(lost))
  check('and is kept for the tab', lost.window.sessionStorage.getItem('rpc') === RPC)

  // Without code at the Safe nothing stands; with it, the Safe is 1-of-1 and
  // every other call but resolver(bytes32) answers as addr(bytes32).
  const calldata = (params) => params?.[0]?.data ?? params?.[0]?.input ?? ''
  const local = (onCall, ring = false) => (method, params) => {
    if (method === 'eth_chainId') return toHex(foundry.id)
    if (method === 'eth_getCode') return ring && params?.[0]?.toLowerCase() === SAFE.toLowerCase() ? '0x60' : '0x'
    const data = calldata(params)
    return (ring && SAFE_AT_ONE[data.slice(0, 10)]) || onCall(data)
  }
  const unset = local(() => pad('0x0'))
  const noResolver = local(() => pad('0x0'), true)
  const otherResolver = local((data) => (data.startsWith(RESOLVER_SELECTOR) ? pad('0x1234') : pad('0x0')), true)
  for (const [name, handler] of [
    ['no Safe code', unset],
    ['a name with no resolver', noResolver],
    ['a name resolving to nothing', local((data) => (data.startsWith(RESOLVER_SELECTOR) ? pad(ENS_PUBLIC_RESOLVER) : pad('0x0')), true)],
  ]) {
    const stub = await stubRpc(handler)
    const dom = open(URL_BASE, OWNER_A, {}, { rpc: null, route: { [BAKED_ORIGIN]: stub.url } })
    check(`${name}: "Nothing stands here yet."`, await says(dom, 'Nothing stands here yet.', 60000), text(dom))
    check(`${name}: that one quiet line, and nothing to retry`,
      !doc(dom).querySelector('#panel .thorn') && doc(dom).querySelectorAll('#panel .note').length === 1 && !doc(dom).querySelector('#panel .lead')
        && !doc(dom).getElementById('retry'),
      text(dom))
    const supplied = open(URL_BASE, OWNER_A, {}, { rpc: stub.url })
    check(`${name}, read through an endpoint you supplied: the RPC prompt, the endpoint forgotten, what it read said`,
      await says(supplied, 'Enter your own RPC endpoint:', 60000) && supplied.window.sessionStorage.getItem('rpc') === null
        && status(supplied) === 'Nothing stands here yet.' && notice(supplied) === '', text(supplied))
    stub.server.close()
  }

  const slow = await stubRpc(unset, 2000)
  const reading = open(URL_BASE, OWNER_A, {}, { rpc: null, route: { [BAKED_ORIGIN]: slow.url } })
  check('while the chain is read: "Reading the chain…", alone',
    await until(() => text(reading) === 'Reading the chain…', 1500) && doc(reading).querySelectorAll('#panel > *').length === 1, text(reading))
  check('then the screen it read', await says(reading, 'Nothing stands here yet.', 60000), text(reading))
  slow.server.close()

  const baked = await stubRpc(() => SEPOLIA)
  const bakedOther = open(URL_BASE, OWNER_A, {}, { rpc: null, route: { [BAKED_ORIGIN]: baked.url } })
  check('the baked set answers for another chain: "No public RPC endpoint was reached.", and the footer names none of it',
    await says(bakedOther, 'Enter your own RPC endpoint:', 60000) && status(bakedOther) === 'No public RPC endpoint was reached.' && notice(bakedOther) === '',
    text(bakedOther))
  baked.server.close()

  const moved = await stubRpc(otherResolver)
  const bakedMoved = open(URL_BASE, OWNER_A, {}, { rpc: null, route: { [BAKED_ORIGIN]: moved.url } })
  check(`the baked set names another resolver: "${MOVED}"`,
    await says(bakedMoved, MOVED, 60000) && text(bakedMoved) === MOVED, text(bakedMoved))
  moved.server.close()

  const sepolia = await stubRpc(() => SEPOLIA)
  const otherChain = open(URL_BASE, OWNER_A, {}, { rpc: sepolia.url })
  check('a kept endpoint on another chain: refused, with its line, and no longer named in the footer',
    await says(otherChain, 'Enter your own RPC endpoint:', 60000) && status(otherChain) === 'Your RPC endpoint was not reached.' && notice(otherChain) === ''
      && doc(otherChain).getElementById('rpc')?.classList.contains('pricked') && otherChain.window.sessionStorage.getItem('rpc') === null,
    text(otherChain))
  sepolia.server.close()

  // A typed endpoint naming another resolver is likelier wrong than the name: forgotten, with the prompt.
  const badResolverRpc = await stubRpc(otherResolver)
  const badResolver = open(URL_BASE, OWNER_A, {}, { rpc: badResolverRpc.url })
  check('a typed endpoint naming another resolver: the RPC prompt, saying what it read, never a final refusal',
    await says(badResolver, 'Enter your own RPC endpoint:', 60000) && status(badResolver) === MOVED && notice(badResolver) === '', text(badResolver))
  check('and that endpoint is forgotten', badResolver.window.sessionStorage.getItem('rpc') === null)
  badResolverRpc.server.close()

  // The name moves, and the Nonce with it, after the page has read it: the next read that needs the
  // name says so, as a load would.
  const movingLater = () => {
    const later = { moved: false, slow: false }
    const answer = async (method, params) => {
      if (method === 'eth_chainId') return toHex(foundry.id)
      if (method === 'eth_getCode') return params?.[0]?.toLowerCase() === SAFE.toLowerCase() ? '0x60' : '0x'
      const data = calldata(params)
      if (data.startsWith('0xaffed0e0')) return pad(later.moved ? '0x1' : '0x0')
      if (later.slow && data.startsWith('0xa0e67e2b')) await new Promise((r) => setTimeout(r, 3000))
      if (SAFE_AT_ONE[data.slice(0, 10)]) return SAFE_AT_ONE[data.slice(0, 10)]
      if (data.startsWith(RESOLVER_SELECTOR)) return pad(later.moved ? '0x1234' : ENS_PUBLIC_RESOLVER)
      return pad(SAFE)
    }
    return { later, answer }
  }
  for (const [name, press] of [
    ['Ask', (dom) => typeAndAsk(dom, OWNER_B.address)],
    ['the Nonce watch', (dom) => doc(dom).dispatchEvent(new dom.window.Event('visibilitychange'))],
  ]) {
    const bakedNode = movingLater()
    const bakedStub = await stubRpc(bakedNode.answer)
    const viaBaked = open(URL_BASE, OWNER_A, {}, { rpc: null, route: { [BAKED_ORIGIN]: bakedStub.url } })
    await says(viaBaked, 'Ask her to marry you', 60000)
    bakedNode.later.moved = true
    press(viaBaked)
    check(`the name moves after the page read it, through the baked set: ${name} reads "${MOVED}"`,
      await says(viaBaked, MOVED, 60000) && text(viaBaked) === MOVED, text(viaBaked))
    bakedStub.server.close()

    const own = movingLater()
    const ownStub = await stubRpc(own.answer)
    const viaOwn = open(URL_BASE, OWNER_A, {}, { rpc: ownStub.url })
    await says(viaOwn, 'Ask her to marry you', 60000)
    own.later.moved = true
    press(viaOwn)
    check(`and through an endpoint you supplied: ${name} opens the RPC prompt, says what it read, forgets the endpoint`,
      await says(viaOwn, 'Enter your own RPC endpoint:', 60000) && status(viaOwn) === MOVED
        && viaOwn.window.sessionStorage.getItem('rpc') === null && notice(viaOwn) === '', text(viaOwn))
    ownStub.server.close()
  }

  // The watch began on a quiet screen; by the time it reads the moved name, a hand is writing.
  const typing = movingLater()
  const typingStub = await stubRpc(typing.answer)
  const typed = open(URL_BASE, OWNER_A, {}, { rpc: null, route: { [BAKED_ORIGIN]: typingStub.url } })
  await says(typed, 'Ask her to marry you', 60000)
  Object.assign(typing.later, { moved: true, slow: true })
  doc(typed).dispatchEvent(new typed.window.Event('visibilitychange'))
  await new Promise((r) => setTimeout(r, 500))
  doc(typed).getElementById('owner').value = OWNER_B.address
  await new Promise((r) => setTimeout(r, 4000))
  check('a moved name the watch reads while a hand is writing: the field is left alone',
    !text(typed).includes(MOVED) && doc(typed).getElementById('owner')?.value === OWNER_B.address, text(typed))
  typingStub.server.close()

  // One read fails fast while the others answer late: the forgotten endpoint must not name itself again.
  const late = await stubRpc(async (method, params) => {
    if (method === 'eth_call' && params?.[0]?.data?.startsWith('0xe75235b8')) throw new Error('getThreshold fails')
    if (method === 'eth_call') await new Promise((r) => setTimeout(r, 2500))
    return pub.request({ method, params })
  })
  const racing = open(URL_BASE, OWNER_A, {}, { rpc: late.url })
  await says(racing, 'Enter your own RPC endpoint:', 60000)
  await new Promise((r) => setTimeout(r, 4000))
  check('a late answer from a forgotten endpoint names nobody in the footer', notice(racing) === '', notice(racing))
  late.server.close()

  const keyed = await stubRpc((method, params) => pub.request({ method, params }))
  const withKey = open(URL_BASE, OWNER_A, {}, { rpc: `${keyed.url}/v3/SECRET` })
  await says(withKey, 'Ask her to marry you', 60000)
  check('a supplied endpoint is named in the footer by its host',
    notice(withKey) === noticeFor(new URL(keyed.url).host), notice(withKey))
  check('and nothing after the host', !notice(withKey).includes('SECRET'), notice(withKey))
  keyed.server.close()
}

export async function unreachableAtActs() {
  console.log('\nThe chain lost while a button acts')
  await restageSingleOwner()
  const cut = []
  const asking = open(URL_BASE, OWNER_A, {}, { refuse: cut })
  await says(asking, 'Ask her to marry you')
  cut.push('eth_call')
  typeAndAsk(asking, OWNER_B.address)
  check('the Ask button with the typed endpoint gone: the endpoint prompt, nothing signed',
    await says(asking, 'Enter your own RPC endpoint:', 60000) && !doc(asking).querySelector('.qr'), text(asking))
  check('the endpoint forgotten, its field marked, and its line',
    asking.window.sessionStorage.getItem('rpc') === null && doc(asking).getElementById('rpc')?.getAttribute('aria-invalid') === 'true'
      && status(asking) === 'Your RPC endpoint was not reached.' && notice(asking) === '', status(asking))

  cut.length = 0
  doc(asking).getElementById('rpc').value = RPC
  doc(asking).getElementById('retry').click()
  await says(asking, 'Ask her to marry you', 60000)
  cut.push('eth_call')
  typeAndAsk(asking, OWNER_B.address)
  check('connected, then lost at the Ask button: the line still shows',
    await says(asking, 'Enter your own RPC endpoint:', 60000) && status(asking) === 'Your RPC endpoint was not reached.', status(asking))

  const { link } = await askAsA()
  const lost = []
  const answering = open(link, OWNER_B, {}, { refuse: lost })
  await says(answering, 'Just say yes')
  lost.push('eth_call')
  doc(answering).getElementById('go').click()
  check('the Yes button with the typed endpoint gone: the endpoint prompt, with its line',
    await says(answering, 'Enter your own RPC endpoint:', 60000) && status(answering) === 'Your RPC endpoint was not reached.', text(answering))
  const threshold = await pub.readContract({ address: SAFE, abi: SAFE_FULL_ABI, functionName: 'getThreshold' })
  check('and nothing was sent', threshold === 1n)
}
