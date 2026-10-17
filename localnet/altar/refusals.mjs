/** Dead ends: refused links, a shared gateway, a screen that fails to draw. */
import { OWNER_A, OWNER_B } from '../stage.mjs'
import { check, until } from '../check.mjs'
import {
  URL_BASE, DEAD, brokenChecksum, UNANSWERABLE, open, doc, text, says, withFragment,
} from './harness.mjs'

export async function refusedLinks(ctx) {
  const { safe, carried } = ctx
  console.log('\nLinks that are refused')
  const cases = [
    ['a tampered field', { ...carried, newOwner: DEAD }],
    ['a different Safe', { ...carried, safe: DEAD }],
    ['a stale nonce', { ...carried, nonce: '9' }],
    ['no signature', { safe, newOwner: OWNER_B.address, nonce: '0' }],
    ['a signature no owner made', { ...carried, sig: `0x${'11'.repeat(64)}1b` }],
    ['a Safe address with a broken checksum', { ...carried, safe: brokenChecksum(carried.safe) }],
    ['her address with a broken checksum', { ...carried, newOwner: brokenChecksum(carried.newOwner) }],
  ]
  for (const [name, payload] of cases) {
    const dom = open(withFragment(payload), OWNER_B)
    check(`${name}: "${UNANSWERABLE}"`, await says(dom, UNANSWERABLE), text(dom))
    check(`${name}: no answer is offered`, !doc(dom).getElementById('go'))
    check(`${name}: refused in a single red line`,
      doc(dom).querySelectorAll('#panel .thorn').length === 1 && !doc(dom).querySelector('#panel .lead'),
      text(dom))
  }
  const junk = open(`${URL_BASE}#not-a-handoff`, OWNER_B)
  check('an unreadable fragment is refused alike', await says(junk, UNANSWERABLE) && !text(junk).includes('Ask her'), text(junk))
  const bare = open(`${URL_BASE}#`, OWNER_B)
  check(`a bare # shows the Ask screen, not "${UNANSWERABLE}"`,
    await says(bare, 'Ask her to marry you') && !text(bare).includes(UNANSWERABLE), text(bare))
}

export async function sharedGateway() {
  console.log('\nA shared gateway')
  const gateway = open('https://gateway.test/ipfs/bafyaltar/', OWNER_A)
  const said = () => doc(gateway).body.textContent.replace(/\s+/g, ' ')
  check('under /ipfs/ the page refuses to run', await until(() => said().includes('This Page cannot run here.')), said())
  check('and reads nothing it was told to', !doc(gateway).getElementById('panel').textContent.includes('Ask her to marry you'))
  check('in its own shell, with no notice line', said().includes('Consent as Architecture') && !doc(gateway).querySelector('.page-notice'), said())
}

export async function undrawable() {
  console.log('\nA screen that cannot be drawn')
  const broken = open(URL_BASE, OWNER_A, {}, {
    setup: (win) => {
      const byId = win.document.getElementById.bind(win.document)
      win.document.getElementById = (id) => (id === 'ask' ? null : byId(id))
    },
  })
  check('a screen that fails to draw: "Something went wrong."', await says(broken, 'Something went wrong.'), text(broken))
  check('in one red line, and the nonce read stops',
    doc(broken).querySelectorAll('#panel .thorn').length === 1 && !broken.window.periods.includes(300000), text(broken))
}
