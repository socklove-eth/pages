/** The nonce watch: what an idle page reads, and what a moved nonce redraws. */
import { pad, toHex } from 'viem'
import { OWNER_A, OWNER_B, STRANGER, bumpSafeNonce, pub, restageSingleOwner } from '../stage.mjs'
import { check, until } from '../check.mjs'
import {
  URL_BASE, UNANSWERABLE, open, doc, shown, text, status, says, stubRpc, typeAndAsk, askAsA,
} from './harness.mjs'

export async function idleReads() {
  console.log('\nWhat an idle page costs')
  const idle = { n: 0 }
  const page = open(URL_BASE, null, {}, { count: idle })
  const hiddenCalls = { n: 0 }
  const hidden = open(URL_BASE, null, {}, { count: hiddenCalls })
  await says(page, 'Ask her to marry you')
  await says(hidden, 'Ask her to marry you')
  check('the nonce is read every five minutes', page.window.periods.includes(300000), String(page.window.periods))
  let isHidden = true
  Object.defineProperty(doc(hidden), 'hidden', { get: () => isHidden })
  // Unchanged, only the nonce is read: one call, against five for the full state.
  const after = idle.n
  const before = hiddenCalls.n
  await new Promise((r) => setTimeout(r, 65000))
  check('one read per interval, not the whole state', idle.n - after <= 2, `${idle.n - after} call(s) in one interval`)
  check('and the screen is unchanged', await says(page, 'Ask her to marry you'), text(page))
  check('a hidden tab reads nothing', hiddenCalls.n === before, `${hiddenCalls.n - before} call(s)`)
  isHidden = false
  shown(hidden)
  check('and reads once when shown again', await until(() => hiddenCalls.n > before, 5000) && hiddenCalls.n - before <= 2, `${hiddenCalls.n - before} call(s)`)
}

export async function nonceMoves() {
  console.log('\nThe nonce moving at 1-of-1')
  const { safe } = await restageSingleOwner()
  const { dom: asked, link } = await askAsA()
  const answering = open(link, OWNER_B)
  await says(answering, 'Just say yes')
  const complaint = open(URL_BASE, STRANGER)
  await says(complaint, 'Ask her to marry you')
  typeAndAsk(complaint, OWNER_B.address)
  await until(() => status(complaint) === 'Your wallet is not on the right account.')
  // Emptied without an input event: only the message under the button holds the screen.
  doc(complaint).getElementById('owner').value = ''
  const breaking = open(URL_BASE, OWNER_A)
  await says(breaking, 'Ask her to marry you')
  // The redraw cannot find its button, so drawing it throws.
  const byId = doc(breaking).getElementById.bind(doc(breaking))
  doc(breaking).getElementById = (id) => (id === 'ask' ? null : byId(id))

  await bumpSafeNonce(safe)
  for (const dom of [asked, answering, complaint, breaking]) shown(dom)
  check('a Handoff whose nonce has passed goes back to the Ask screen', await says(asked, 'Ask her to marry you'), text(asked))
  check('an open Answer whose nonce has passed is refused', await says(answering, UNANSWERABLE), text(answering))
  check('a redraw that fails: "Something went wrong.", in one red line',
    await says(breaking, 'Something went wrong.') && doc(breaking).querySelectorAll('#panel .thorn').length === 1, text(breaking))
  await new Promise((r) => setTimeout(r, 3000))
  check('a screen with a message under it is left alone', status(complaint) === 'Your wallet is not on the right account.', status(complaint))
}

export async function laggingNode() {
  console.log('\nA lagging node reporting an older Nonce')
  const { link } = await askAsA()
  // Forwards to the chain, until lag is on: then nonce() answers one lower than the chain.
  let lag = false
  const node = await stubRpc(async (method, params) => {
    const result = await pub.request({ method, params })
    if (lag && method === 'eth_call' && params?.[0]?.data?.startsWith('0xaffed0e0')) return pad(toHex(BigInt(result) - 1n))
    return result
  })
  const answer = open(link, OWNER_B, {}, { rpc: node.url })
  await says(answer, 'Just say yes')
  lag = true
  let isHidden = true
  Object.defineProperty(doc(answer), 'hidden', { get: () => isHidden, configurable: true })
  isHidden = false
  shown(answer)
  await new Promise((r) => setTimeout(r, 4000))
  check('an older Nonce from a lagging node never refuses a valid link', text(answer).includes('Just say yes'), text(answer))
  node.server.close()
}
