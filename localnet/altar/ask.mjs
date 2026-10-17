/** The Ask screen: asking, the Handoff it produces, and the address field. */
import { recoverAddress } from 'viem'
import { OWNER_A, OWNER_B, SAFE, STRANGER } from '../stage.mjs'
import { check, until } from '../check.mjs'
import {
  URL_BASE, brokenChecksum, open, doc, buttonName, text, status, says, pressEnter, typeAndAsk, decode, askAsA, linkOf,
} from './harness.mjs'

export async function asking(ctx) {
  const { safe } = ctx
  console.log('\nThe ask')
  const { dom: signer, link } = await askAsA()
  check('asking produces the handoff screen', text(signer).includes('will you marry me'), text(signer).slice(0, 160))
  check('the link is this page with a fragment', link.startsWith(`${URL_BASE}#`) && link.length > URL_BASE.length + 20, link.slice(0, 60))

  const carried = decode(link)
  check('the fragment carries exactly safe, newOwner, nonce and sig',
    JSON.stringify(Object.keys(carried)) === '["safe","newOwner","nonce","sig"]', Object.keys(carried).join(','))
  check('the signature is 65 bytes', typeof carried.sig === 'string' && carried.sig.length === 132)
  check('it names the staged Safe, the new owner and nonce 0',
    carried.safe.toLowerCase() === safe.toLowerCase() && carried.newOwner === OWNER_B.address && carried.nonce === '0')

  const hash = doc(signer).querySelector('[data-copy^="0x"]')?.getAttribute('data-copy') ?? ''
  check('the transaction hash is printed in full', /^0x[0-9a-f]{64}$/.test(hash), hash)
  check('the hash on screen is the one that was signed',
    (await recoverAddress({ hash, signature: carried.sig })).toLowerCase() === OWNER_A.address.toLowerCase())

  // A query never reaches the link, so a long one cannot outgrow the QR code.
  const queried = open(`${URL_BASE}?${'q'.repeat(3000)}`, OWNER_A)
  await says(queried, 'Ask her to marry you')
  typeAndAsk(queried, OWNER_B.address)
  check('a page opened with a long query still shows the QR code',
    await says(queried, 'will you marry me') && !!doc(queried).querySelector('.qr svg') && !status(queried), text(queried).slice(0, 120))
  check('every copy target is keyboard-reachable',
    [...doc(signer).querySelectorAll('[data-copy]')].every((el) => el.getAttribute('role') === 'button' && el.getAttribute('tabindex') === '0'))

  const qr = doc(signer).querySelector('.qr svg')
  check('a QR code is drawn, one path in an svg', Boolean(qr) && qr.querySelectorAll('path').length === 1 && Boolean(qr.getAttribute('viewBox')))
  const handoffLead = doc(signer).querySelector('#panel .lead')
  check('the Handoff screen reads exactly so',
    handoffLead?.textContent === '🧦 Sockthief, will you marry me?' && handoffLead.querySelector('strong')?.textContent === 'Sockthief',
    handoffLead?.textContent)
  const hashTarget = doc(signer).querySelector('#panel [data-copy]')
  check('the hash is named for screen readers and titled Copy',
    hashTarget?.getAttribute('aria-label') === 'Copy the transaction hash' && hashTarget.getAttribute('title') === 'Copy')

  // A wallet answering with the high-s twin: turned into its low-s form, so the link still answers.
  const twin = open(URL_BASE, OWNER_A, { highS: true })
  await says(twin, 'Ask her to marry you')
  typeAndAsk(twin, OWNER_B.address)
  check('a wallet returning the high-s twin still produces a link, in its low-s form',
    await says(twin, 'will you marry me', 30000) && BigInt(`0x${decode(linkOf(twin)).sig.slice(66, 130)}`) <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n, text(twin))

  // A wallet answering with another key's signature: recovered before anything is shown.
  const foreign = open(URL_BASE, OWNER_A, { signAs: STRANGER })
  await says(foreign, 'Ask her to marry you')
  typeAndAsk(foreign, OWNER_B.address)
  check('a signature no owner made: "It did not go through." under Ask, no QR code',
    await until(() => status(foreign) === 'It did not go through.', 30000) && !doc(foreign).querySelector('.qr'), text(foreign))
  Object.assign(ctx, { signer, link, carried })
}

export async function typing() {
  console.log('\nTyping into the ask')
  const typo = open(URL_BASE, OWNER_A)
  await says(typo, 'Ask her to marry you')
  const field = () => doc(typo).getElementById('owner')
  const askLead = doc(typo).querySelector('#panel .lead')
  check('the Ask screen reads exactly so',
    askLead?.textContent === 'Ask her to marry you and put the 💍 Ring on her finger.' && askLead.querySelector('strong')?.textContent === 'Ring',
    askLead?.textContent)
  check('its field is labelled, its placeholder exact, its button named Ask',
    doc(typo).querySelector('label[for="owner"]')?.textContent === 'Sockthief’s address'
      && field().getAttribute('placeholder') === 'Insert Sockthief’s address…'
      && buttonName(doc(typo).getElementById('ask')) === 'Ask')
  check('Ask shows 🧎, hidden from screen readers',
    doc(typo).querySelector('#ask .symbol[aria-hidden="true"]')?.textContent === '🧎', doc(typo).getElementById('ask')?.textContent)
  check('the logo is named SockLove', doc(typo).querySelector('.page-logo')?.getAttribute('alt') === 'SockLove')

  typeAndAsk(typo, 'not-an-address')
  check('a value that is not address-shaped is cleared, silently', field().value === '' && status(typo) === '')
  check('and the field is marked for a moment', field().classList.contains('pricked'))
  check('and marked invalid for a screen reader, focused', field().getAttribute('aria-invalid') === 'true' && doc(typo).activeElement === field())
  field().value = '0'
  field().dispatchEvent(new typo.window.Event('input'))
  check('until the next keystroke', field().getAttribute('aria-invalid') === null)
  check('then lets it go', await until(() => !field().classList.contains('pricked'), 3000))
  check('and no wallet is asked', !text(typo).includes('wallet is asking'))

  field().value = 'not-an-address'
  pressEnter(typo, 'owner')
  check('Enter presses Ask', await until(() => field().value === '', 5000))

  for (const [name, value] of [
    ['a bad checksum', brokenChecksum(OWNER_B.address)],
    ['an all-lowercase address', OWNER_B.address.toLowerCase()],
    ['an all-uppercase address', `0x${OWNER_B.address.slice(2).toUpperCase()}`],
    ['the zero address', `0x${'0'.repeat(40)}`],
    ['the Safe\'s sentinel', `0x${'0'.repeat(39)}1`],
    ['the Safe itself', SAFE],
    ['an owner already', OWNER_A.address],
  ]) {
    typeAndAsk(typo, value)
    check(`${name} is cleared, silently`, await until(() => field().value === '', 5000) && status(typo) === '', status(typo))
  }

  field().value = OWNER_B.address
  pressEnter(typo, 'owner')
  check('Enter with a real address reaches the wallet', await says(typo, 'will you marry me'), text(typo))
  check('and the asked address is not kept once signed', typo.window.sessionStorage.getItem('owner') === null)

  // A chain switch reloads the page; the address asked before it comes back once.
  const switched = open(URL_BASE, OWNER_A, {}, { owner: OWNER_B.address })
  await says(switched, 'Ask her to marry you')
  check('an address kept across a reload is back in the field',
    doc(switched).getElementById('owner')?.value === OWNER_B.address, doc(switched).getElementById('owner')?.value)
  check('and only once', switched.window.sessionStorage.getItem('owner') === null)
}
