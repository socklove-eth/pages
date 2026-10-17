/** A reload of the Handoff screen, and signers that return a low v. */
import { OWNER_A, OWNER_B, pub } from '../stage.mjs'
import { check } from '../check.mjs'
import {
  URL_BASE, open, text, linkOf, says, typeAndAsk, decode, askAsA,
} from './harness.mjs'

export async function reload(ctx) {
  const { link } = ctx
  console.log('\nA reload of the Handoff screen')
  const { dom: asker, link: shown } = await askAsA()
  const storage = asker.window.sessionStorage
  const kept = Array.from({ length: storage.length }, (_, i) => [storage.key(i), storage.getItem(storage.key(i))])
  const sig = decode(shown).sig
  check('the tab keeps no signed link', kept.every(([, v]) => !v.includes(sig.slice(2, 40))), JSON.stringify(kept))
  // A reload: the same tab's storage, a fresh page.
  const reopened = open(URL_BASE, OWNER_A, {}, { setup: (win) => kept.forEach(([k, v]) => win.sessionStorage.setItem(k, v)) })
  check('a reload starts over at Ask', await says(reopened, 'Ask her to marry you'), text(reopened))

  const txBefore = await pub.getTransactionCount({ address: OWNER_A.address })
  const { link: again } = await askAsA()
  check('asking again gives the identical link', again === link)
  check('and spends no gas', (await pub.getTransactionCount({ address: OWNER_A.address })) === txBefore)
}

export async function lowV() {
  console.log('\nA signer that returns v as 0 or 1')
  const low = open(URL_BASE, OWNER_A, { lowV: true })
  await says(low, 'Ask her to marry you')
  typeAndAsk(low, OWNER_B.address)
  check('the ask still produces the Handoff', await says(low, 'will you marry me', 30000), text(low))
  const lowLink = linkOf(low)
  const answerLow = open(lowLink, OWNER_B)
  check('and the link it gives is one the Page accepts', await says(answerLow, 'Just say yes', 30000), text(answerLow))
  const sig = lowLink.includes('#') ? decode(lowLink).sig ?? '' : ''
  check('with v written as 27 or 28', /1[bc]$/.test(sig), sig.slice(-2))
}
