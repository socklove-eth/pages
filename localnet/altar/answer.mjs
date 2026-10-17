/** The Answer screen through to the done screen, and transactions that do not land cleanly. */
import { namehash, pad, toHex } from 'viem'
import {
  CONFIG, ENS_FIRST_LABEL, ENS_REGISTRY_WITH_FALLBACK, ENS_REGISTRY_WITH_FALLBACK_FULL_ABI, ENS_PUBLIC_RESOLVER, ENS_PUBLIC_RESOLVER_FULL_ABI, OWNER_A, OWNER_B,
  SAFE, RPC, SAFE_FULL_ABI, addSecondOwner, asSafe, bumpSafeNonce, pub, restageSingleOwner,
} from '../stage.mjs'
import { check, until } from '../check.mjs'
import {
  BAKED_ORIGIN, URL_BASE, UNANSWERABLE, open, doc, buttonName, text, says, askAsA, stubRpc, status,
} from './harness.mjs'

const MOVED = `This Page no longer reads ${CONFIG.name}.`

const threshold = (safe) => pub.readContract({ address: safe, abi: SAFE_FULL_ABI, functionName: 'getThreshold' })

export async function answered(ctx) {
  const { signer, link } = ctx
  console.log('\nThe answer')
  const answer = open(link, OWNER_B)
  check('the added owner is asked', await says(answer, 'Just say yes'), text(answer))
  const answerLead = doc(answer).querySelector('.lead')
  const block = answerLead?.nextElementSibling
  check('line, hash, then the answer, in that order',
    answerLead?.previousElementSibling === null && block?.classList.contains('copy')
    && Boolean(block.querySelector('.inscription'))
    && block?.nextElementSibling?.id === 'go')
  check('the hash is named in the line above it',
    block?.firstElementChild?.classList.contains('caption')
    && block?.firstElementChild?.textContent === 'Verify this transaction hash:')
  check('the Answer screen reads exactly so',
    answerLead?.textContent === 'Just say yes and put on the 💍 Ring.' && answerLead.querySelector('strong')?.textContent === 'Ring'
      && buttonName(doc(answer).getElementById('go')) === 'Yes', answerLead?.textContent)
  check('Yes shows 💜, hidden from screen readers',
    doc(answer).querySelector('#go .symbol[aria-hidden="true"]')?.textContent === '💜', doc(answer).getElementById('go')?.textContent)

  const busy = open(URL_BASE, OWNER_A)
  await says(busy, 'Ask her to marry you')
  doc(busy).getElementById('owner').value = '0xdeadbeef'

  doc(answer).getElementById('go').click()
  check('executing reaches the done screen', await says(answer, 'She said yes. The 💍 Ring is whole', 40000), text(answer))
  check('the done screen is one line and nothing to press',
    text(answer) === 'She said yes. The 💍 Ring is whole.' && doc(answer).querySelectorAll('#panel button, #panel input').length === 0, text(answer))
  check('the spent fragment is cleared', answer.window.location.hash === '')

  // The poll runs at a third of its real period here; two periods leave room for a loaded machine.
  check('the signer\'s open page moves to the done screen by itself', await says(signer, 'She said yes. The 💍 Ring is whole', 130000), text(signer))
  check('a page with typed input is left alone', doc(busy).getElementById('owner')?.value === '0xdeadbeef')

  const late = open(link, OWNER_B)
  check('a link opened at 2-of-2 shows the done screen', await says(late, 'She said yes. The 💍 Ring is whole'), text(late))
}

export async function chainAfter(ctx) {
  const { safe } = ctx
  console.log('\nThe chain')
  const owners = await pub.readContract({ address: safe, abi: SAFE_FULL_ABI, functionName: 'getOwners' })
  check('the Safe is 2-of-2 with the new owner', (await threshold(safe)) === 2n && owners.some((o) => o.toLowerCase() === OWNER_B.address.toLowerCase()))
  const ownerOf = (name) => pub.readContract({ address: ENS_REGISTRY_WITH_FALLBACK, abi: ENS_REGISTRY_WITH_FALLBACK_FULL_ABI, functionName: 'owner', args: [namehash(name)] })
  const handed = `${CONFIG.label}.${CONFIG.name}`
  const first = `${ENS_FIRST_LABEL}.${CONFIG.name}`
  check(`${handed} is handed to the new owner`, (await ownerOf(handed)).toLowerCase() === OWNER_B.address.toLowerCase())
  check('and resolves to them',
    (await pub.readContract({ address: ENS_PUBLIC_RESOLVER, abi: ENS_PUBLIC_RESOLVER_FULL_ABI, functionName: 'addr', args: [namehash(handed)] })).toLowerCase()
      === OWNER_B.address.toLowerCase())
  check(`${first} is untouched`, (await ownerOf(first)).toLowerCase() === OWNER_A.address.toLowerCase())
  check(`${CONFIG.name} still belongs to the Safe`, (await ownerOf(CONFIG.name)).toLowerCase() === safe.toLowerCase())
}

export async function revert() {
  console.log('\nA transaction the chain refuses')
  const { safe } = await restageSingleOwner()
  const { link } = await askAsA()
  // Too little gas, estimation skipped: the revert is mined and the Nonce stays.
  const starved = open(link, OWNER_B, { gas: 60_000n })
  await says(starved, 'Just say yes')
  doc(starved).getElementById('go').click()
  check('a mined revert: "It did not go through." under Yes',
    await until(() => doc(starved).querySelector('#status .thorn')?.textContent === 'It did not go through.', 40000), text(starved))
  check('the Answer stays, Yes ready again', doc(starved).getElementById('go')?.disabled === false && text(starved).includes('Just say yes'))
  check('and the Safe is unchanged', (await threshold(safe)) === 1n)

  // A dropped connection mid-wait ends viem's wait once; the page waits again and still reports.
  const blip = []
  const shaken = open(link, OWNER_B, { gas: 60_000n }, { refuse: blip })
  await says(shaken, 'Just say yes')
  doc(shaken).getElementById('go').click()
  await says(shaken, 'Waiting for the chain…', 20000)
  blip.push('eth_blockNumber', 'eth_getTransactionReceipt')
  await new Promise((r) => setTimeout(r, 9000))
  blip.length = 0
  check('a revert seen through a dropped connection: still "It did not go through." under Yes',
    await until(() => doc(shaken).querySelector('#status .thorn')?.textContent === 'It did not go through.', 60000), text(shaken))

  // The Nonce moved inside the send: the revert leaves a spent link.
  const spent = open(link, OWNER_B, { gas: 1_000_000n, beforeSend: () => bumpSafeNonce(safe) })
  await says(spent, 'Just say yes')
  doc(spent).getElementById('go').click()
  check('a revert that spent the link: it is refused at once', await says(spent, UNANSWERABLE, 40000), text(spent))
  check('and the Safe is unchanged', (await threshold(safe)) === 1n)
}

export async function replacedOrDropped() {
  console.log('\nA transaction replaced in the wallet, or dropped by the network')
  const { safe } = await restageSingleOwner()
  const { link } = await askAsA()
  const cancelled = open(link, OWNER_B, { replaceSend: true })
  await says(cancelled, 'Just say yes')
  doc(cancelled).getElementById('go').click()
  check('a send replaced by a cancel: the receipt is another transaction\'s, so "It did not go through." under Yes',
    await until(() => doc(cancelled).querySelector('#status .thorn')?.textContent === 'It did not go through.', 40000), text(cancelled))
  check('the Answer stays, its link kept, Yes ready again',
    doc(cancelled).getElementById('go')?.disabled === false && cancelled.window.location.hash.length > 1)
  check('and the Safe is unchanged', (await threshold(safe)) === 1n)

  // Replaced, and meanwhile the name moved: the wait ends as a load would.
  let moved = false
  const movingNode = await stubRpc((method, params) =>
    moved && method === 'eth_call' && params?.[0]?.data?.startsWith('0x0178b8bf') ? pad('0x1234') : pub.request({ method, params }))
  const movedMeanwhile = open(link, OWNER_B, { replaceSend: true, beforeSend: () => { moved = true } }, { rpc: null, route: { [BAKED_ORIGIN]: movingNode.url } })
  await says(movedMeanwhile, 'Just say yes', 60000)
  doc(movedMeanwhile).getElementById('go').click()
  check(`a send replaced while the name moved: "${MOVED}", not a wait for ever`,
    await until(() => text(movedMeanwhile) === MOVED, 60000), text(movedMeanwhile))
  movingNode.server.close()

  // Through your own endpoint: the watch reads the moved name first and opens the prompt; the
  // receipt wait's late error must not replace it with the final refusal.
  let ownMoved = false
  const ownNode = await stubRpc(async (method, params) => {
    const data = params?.[0]?.data ?? ''
    if (ownMoved && method === 'eth_call' && data.startsWith('0x0178b8bf')) return pad('0x1234')
    const result = await pub.request({ method, params })
    return ownMoved && method === 'eth_call' && data.startsWith('0xaffed0e0') ? pad(toHex(BigInt(result) + 1n)) : result
  })
  const viaOwn = open(link, OWNER_B, { replaceSend: true, beforeSend: () => { ownMoved = true } }, { rpc: ownNode.url })
  await says(viaOwn, 'Just say yes', 60000)
  doc(viaOwn).getElementById('go').click()
  await says(viaOwn, 'Waiting for the chain…', 30000)
  doc(viaOwn).dispatchEvent(new viaOwn.window.Event('visibilitychange'))
  await says(viaOwn, 'Enter your own RPC endpoint:', 30000)
  await new Promise((r) => setTimeout(r, 30000))
  check('a replaced send, then a moved name read through your own endpoint: the RPC prompt stays, saying what it read',
    text(viaOwn).includes('Enter your own RPC endpoint:') && status(viaOwn) === MOVED, text(viaOwn))
  ownNode.server.close()

  // A send never mined, its endpoint then forgotten: the wait lets that endpoint go.
  let lostMoved = false
  let asked = 0
  const lostNode = await stubRpc(async (method, params) => {
    asked += 1
    const data = params?.[0]?.data ?? ''
    if (lostMoved && method === 'eth_call' && data.startsWith('0x0178b8bf')) return pad('0x1234')
    const result = await pub.request({ method, params })
    return lostMoved && method === 'eth_call' && data.startsWith('0xaffed0e0') ? pad(toHex(BigInt(result) + 1n)) : result
  })
  const letGo = open(link, OWNER_B, { dropSend: true, beforeSend: () => { lostMoved = true } }, { rpc: lostNode.url })
  await says(letGo, 'Just say yes', 60000)
  doc(letGo).getElementById('go').click()
  await says(letGo, 'Waiting for the chain…', 30000)
  doc(letGo).dispatchEvent(new letGo.window.Event('visibilitychange'))
  await says(letGo, 'Enter your own RPC endpoint:', 30000)
  await new Promise((r) => setTimeout(r, 2000))
  const before = asked
  await new Promise((r) => setTimeout(r, 15000))
  check('a send never mined, its endpoint then forgotten: the wait stops asking that endpoint, at once',
    asked === before, `${asked - before} request(s) in 15 s`)
  lostNode.server.close()

  // A wait let go when its endpoint is forgotten: its button's handler must not re-arm the Yes of the
  // Answer drawn since, while that Yes is open in the wallet.
  let staleMoved = false
  const staleNode = await stubRpc(async (method, params) => {
    const data = params?.[0]?.data ?? ''
    if (staleMoved && method === 'eth_call' && data.startsWith('0x0178b8bf')) return pad('0x1234')
    const result = await pub.request({ method, params })
    return staleMoved && method === 'eth_call' && data.startsWith('0xaffed0e0') ? pad(toHex(BigInt(result) + 1n)) : result
  })
  const honestNode = await stubRpc((method, params) => pub.request({ method, params }))
  let sends = 0
  let secondOpen = false
  const twice = open(link, OWNER_B, {
    dropSend: true,
    beforeSend: async () => {
      sends += 1
      if (sends === 1) { staleMoved = true; return }
      secondOpen = true
      await new Promise((r) => setTimeout(r, 60000))
      secondOpen = false
    },
  }, { rpc: staleNode.url })
  // Blocks keep coming, as on Ethereum.
  const miner = setInterval(() => pub.request({ method: 'evm_mine', params: [] }).catch(() => {}), 3000)
  await says(twice, 'Just say yes', 60000)
  doc(twice).getElementById('go').click()
  await says(twice, 'Waiting for the chain…', 30000)
  await new Promise((r) => setTimeout(r, 8000))
  doc(twice).dispatchEvent(new twice.window.Event('visibilitychange'))
  await says(twice, 'Enter your own RPC endpoint:', 30000)
  // Six minutes pass: the kept send counts as dropped.
  const [sentFor, sentTx] = twice.window.sessionStorage.getItem('sent').split(' ')
  twice.window.sessionStorage.setItem('sent', `${sentFor} ${sentTx} ${Date.now() - 400_000}`)
  doc(twice).getElementById('rpc').value = honestNode.url
  doc(twice).getElementById('retry').click()
  await says(twice, 'Just say yes', 30000)
  doc(twice).getElementById('go').click()
  await until(() => secondOpen, 10000)
  const rearmed = await until(() => secondOpen && doc(twice).getElementById('go')?.disabled === false, 40000)
  clearInterval(miner)
  check('a superseded Yes never re-arms the newer one while it is open in the wallet', !rearmed && sends === 2, `${sends} send(s)`)
  staleNode.server.close()
  honestNode.server.close()

  // A dropped send never gets a receipt: the wait stands, so a pending send cannot be sent twice.
  const dropped = open(link, OWNER_B, { dropSend: true })
  await says(dropped, 'Just say yes')
  doc(dropped).getElementById('go').click()
  check('a dropped send waits for the chain', await says(dropped, 'Waiting for the chain…', 20000), text(dropped))
  await new Promise((r) => setTimeout(r, 15000))
  check('and keeps waiting: no Yes to press again, nothing said',
    !doc(dropped).getElementById('go') && text(dropped) === 'Waiting for the chain…', text(dropped))
  check('a reload brings the Answer back', await says(open(link, OWNER_B), 'Just say yes', 30000))
  // The send is kept under the SafeTx's hash, the copy target on the Answer screen.
  const shown = open(link, OWNER_B)
  await says(shown, 'Just say yes')
  const safeTxHash = doc(shown).querySelector('#panel [data-copy^="0x"]')?.getAttribute('data-copy')
  check('the Answer screen shows the SafeTx hash the send is kept under', /^0x[0-9a-f]{64}$/i.test(safeTxHash ?? ''), safeTxHash)
  const unknown = `0x${'ab'.repeat(32)}`
  const droppedTab = open(link, OWNER_B, {}, { sent: `${safeTxHash} ${unknown} ${Date.now() - 400_000}` })
  check('and so does a reload of the same tab, once the chain has not known the send for six minutes: it was dropped',
    await says(droppedTab, 'Just say yes', 60000) && droppedTab.window.sessionStorage.getItem('sent') === null, text(droppedTab))
  const youngTab = open(link, OWNER_B, {}, { sent: `${safeTxHash} ${unknown} ${Date.now()}` })
  await new Promise((r) => setTimeout(r, 5000))
  check('but a send not yet six minutes old, unseen by the chain, is still waited for: a private route may hold it',
    text(youngTab) === 'Waiting for the chain…' && !doc(youngTab).getElementById('go'), text(youngTab))
  const futureTab = open(link, OWNER_B, {}, { sent: `${safeTxHash} ${unknown} ${Date.now() + 86_400_000}` })
  await new Promise((r) => setTimeout(r, 3000))
  check('a send time in the future counts as now: waited for, not for ever', text(futureTab) === 'Waiting for the chain…', text(futureTab))

  // A send still pending: the same tab, reloaded, waits for it again rather than offer Yes.
  await pub.request({ method: 'evm_setAutomine', params: [false] })
  try {
    const sending = open(link, OWNER_B)
    await says(sending, 'Just say yes')
    doc(sending).getElementById('go').click()
    await says(sending, 'Waiting for the chain…', 20000)
    const kept = sending.window.sessionStorage.getItem('sent')
    check('the pending send is kept for the tab, under its SafeTx hash, with the time it was sent',
      kept?.startsWith(`${safeTxHash} 0x`) && Math.abs(Number(kept.split(' ')[2]) - Date.now()) < 120_000, kept)
    const blind = open(link, OWNER_B, {}, { sent: kept, refuse: ['eth_getTransactionByHash'] })
    await new Promise((r) => setTimeout(r, 3000))
    check('a reload whose endpoint cannot read the send waits too: a lost read is no drop',
      text(blind) === 'Waiting for the chain…' && !doc(blind).getElementById('go'), text(blind))
    const reloaded = open(link, OWNER_B, {}, { sent: kept })
    check('a reload while it is pending waits again: no Yes to press twice',
      await says(reloaded, 'Waiting for the chain…', 30000) && !doc(reloaded).getElementById('go'), text(reloaded))
    await pub.request({ method: 'evm_mine', params: [] })
    check('and once it lands, the done screen', await says(reloaded, 'She said yes', 60000), text(reloaded))
    check('the kept send is forgotten', await until(() => reloaded.window.sessionStorage.getItem('sent') === null, 10000))
  } finally {
    await pub.request({ method: 'evm_setAutomine', params: [true] })
  }
  check('on chain, threshold 2', (await threshold(safe)) === 2n)

  // The Nonce moves while a reload waits for a send the chain never saw: the chain's state decides.
  const { safe: again } = await restageSingleOwner()
  const fresh = (await askAsA()).link
  const freshShown = open(fresh, OWNER_B)
  await says(freshShown, 'Just say yes')
  const freshHash = doc(freshShown).querySelector('#panel [data-copy^="0x"]')?.getAttribute('data-copy')
  const movedTab = open(fresh, OWNER_B, {}, { sent: `${freshHash} ${unknown} ${Date.now()}` })
  await says(movedTab, 'Waiting for the chain…', 20000)
  await bumpSafeNonce(again)
  check('a reload waiting for an unseen send, the Nonce then moved: the link is spent, and refused',
    await says(movedTab, UNANSWERABLE, 40000) && movedTab.window.sessionStorage.getItem('sent') === null, text(movedTab))
}

export async function unreadableReceipt() {
  console.log('\nA transaction sent while the receipt cannot be read')
  const { safe } = await restageSingleOwner()
  const { link } = await askAsA()
  const answer = open(link, OWNER_B, {}, { refuse: ['eth_getTransactionReceipt'] })
  await says(answer, 'Just say yes')
  doc(answer).getElementById('go').click()
  check('it keeps waiting for the chain, never reported as failed, the Yes button gone',
    await until(() => !doc(answer).getElementById('go'), 40000)
    && text(answer) === 'Waiting for the chain…', text(answer))
  check('and it did land', (await threshold(safe)) === 2n)
  check('the page moves to the done screen by itself', await says(answer, 'She said yes. The 💍 Ring is whole', 130000), text(answer))
}

export async function done() {
  console.log('\nThe done screen')
  await restageSingleOwner()
  await addSecondOwner(SAFE)
  const waiting = open(URL_BASE, OWNER_A)
  check('a fresh page at 2-of-2 shows only the done screen', await says(waiting, 'She said yes. The 💍 Ring is whole') && !doc(waiting).getElementById('ask'), text(waiting))

  const doneCalls = { n: 0 }
  const settled = open(URL_BASE, OWNER_A, {}, { count: doneCalls })
  await says(settled, 'She said yes. The 💍 Ring is whole')
  const after = doneCalls.n
  await new Promise((r) => setTimeout(r, 65000))
  check('and the done screen asks the chain nothing further', doneCalls.n === after, `${doneCalls.n - after} call(s) in one interval`)

  const node = namehash(CONFIG.name)
  await asSafe(ENS_REGISTRY_WITH_FALLBACK, ENS_REGISTRY_WITH_FALLBACK_FULL_ABI, 'setResolver', [node, OWNER_A.address])
  const moved = open(URL_BASE, OWNER_A)
  check('the yes stays shown after the name moves to another resolver',
    await says(moved, 'She said yes. The 💍 Ring is whole') && !text(moved).includes('no longer reads'), text(moved))

  await restageSingleOwner()
  await asSafe(ENS_PUBLIC_RESOLVER, ENS_PUBLIC_RESOLVER_FULL_ABI, 'setAddr', [node, OWNER_A.address])
  const elsewhere = open(URL_BASE, OWNER_A, {}, { rpc: null, route: { [BAKED_ORIGIN]: RPC } })
  check('a Ring awaiting the Proposal is not read when the name resolves elsewhere',
    await says(elsewhere, `This Page no longer reads ${CONFIG.name}.`), text(elsewhere))
  const elsewhereYours = open(URL_BASE, OWNER_A)
  check('read through your own endpoint, the RPC prompt instead, saying what it read',
    await says(elsewhereYours, 'Enter your own RPC endpoint:') && text(elsewhereYours).includes(`This Page no longer reads ${CONFIG.name}.`), text(elsewhereYours))

  // Later parts expect a 2-of-2 Safe, its name pointing at it.
  await restageSingleOwner()
  await addSecondOwner(SAFE)
}
