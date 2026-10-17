/** Wallet states at the Ask and at the Answer, and wallets that announce themselves. */
import { OWNER_A, OWNER_B, SAFE_FULL_ABI, STRANGER, pub } from '../stage.mjs'
import { check, until } from '../check.mjs'
import {
  URL_BASE, open, doc, buttonName, text, status, says, stubWallet, typeAndAsk,
} from './harness.mjs'

export async function walletsAtAsk() {
  console.log('\nWallet states at the ask')
  const wrongChain = open(URL_BASE, OWNER_A, { chainId: 1 })
  await says(wrongChain, 'Ask her to marry you')
  typeAndAsk(wrongChain, OWNER_B.address)
  check('a wallet on another chain: "Your wallet is not on the right chain.", that one line alone',
    await until(() => status(wrongChain) === 'Your wallet is not on the right chain.'), status(wrongChain))

  const noWallet = open(URL_BASE, null)
  await says(noWallet, 'Ask her to marry you')
  typeAndAsk(noWallet, OWNER_B.address)
  check('no wallet: the ask says "No wallet."', text(noWallet).includes('No wallet.'), text(noWallet))
  check('and pressing adds nothing', await until(() => !doc(noWallet).getElementById('ask').disabled) && status(noWallet) === '', status(noWallet))
  noWallet.window.dispatchEvent(new noWallet.window.CustomEvent('eip6963:announceProvider', {
    detail: { info: { rdns: 'test.late', name: 'Late' }, provider: stubWallet(OWNER_A, {}) },
  }))
  check('a wallet announcing afterwards: "No wallet." is gone', await until(() => !text(noWallet).includes('No wallet.'), 3000), text(noWallet))

  const stranger = open(URL_BASE, STRANGER)
  await says(stranger, 'Ask her to marry you')
  typeAndAsk(stranger, OWNER_B.address)
  check('a key that owns nothing: "Your wallet is not on the right account."',
    await until(() => status(stranger).includes('Your wallet is not on the right account.')), status(stranger))
  doc(stranger).getElementById('owner').dispatchEvent(new stranger.window.Event('input'))
  check('typing an address clears the line under it', status(stranger) === '', status(stranger))

  const failing = open(URL_BASE, OWNER_A, { failSign: true })
  await says(failing, 'Ask her to marry you')
  typeAndAsk(failing, OWNER_B.address)
  check('a wallet error: "It did not go through." under the button',
    await until(() => doc(failing).querySelector('#status .thorn')?.textContent === 'It did not go through.'), status(failing))
  check('and Ask is ready again', doc(failing).getElementById('ask')?.disabled === false)

  const switchOpen = open(URL_BASE, OWNER_A, { chainId: 1, pendingSwitch: true })
  await says(switchOpen, 'Ask her to marry you')
  typeAndAsk(switchOpen, OWNER_B.address)
  check('a chain switch already open in the wallet: "Your wallet is asking…"',
    await until(() => status(switchOpen) === 'Your wallet is asking…' && !doc(switchOpen).getElementById('ask')?.disabled), status(switchOpen))

  const pickerOpen = open(URL_BASE, OWNER_A, { granted: OWNER_B.address, pendingPermissions: true })
  await says(pickerOpen, 'Ask her to marry you')
  typeAndAsk(pickerOpen, OWNER_B.address)
  check('an account picker already open in the wallet: "Your wallet is asking…"',
    await until(() => status(pickerOpen) === 'Your wallet is asking…' && !doc(pickerOpen).getElementById('ask')?.disabled), status(pickerOpen))

  // A minute of the page's clock passes in two seconds.
  const unanswered = open(URL_BASE, OWNER_A, { grantAfterMs: Infinity }, { fastClock: true })
  await says(unanswered, 'Ask her to marry you')
  typeAndAsk(unanswered, OWNER_B.address)
  check('a wallet that never shares an account: the line stays, and Ask is ready again after a minute',
    await until(() => doc(unanswered).getElementById('ask')?.disabled === false && status(unanswered) === 'Your wallet is asking…', 15000),
    status(unanswered))

  const nobody = open(URL_BASE, OWNER_A, { noAccounts: true })
  await says(nobody, 'Ask her to marry you')
  typeAndAsk(nobody, OWNER_B.address)
  check('a wallet that shares no account is passed over silently, Ask ready again',
    await until(() => doc(nobody).getElementById('ask')?.disabled === false) && status(nobody) === '', status(nobody))

  const granted = open(URL_BASE, OWNER_A, { granted: OWNER_B.address })
  await says(granted, 'Ask her to marry you')
  typeAndAsk(granted, OWNER_B.address)
  check('a site granted the wrong account opens the picker and proceeds', await says(granted, 'will you marry me'), text(granted))

  const waiting = open(URL_BASE, OWNER_A, { grantAfterMs: 2500 })
  await says(waiting, 'Ask her to marry you')
  typeAndAsk(waiting, OWNER_B.address)
  check('a request already open in the wallet: "Your wallet is asking…" at Ask',
    await until(() => status(waiting) === 'Your wallet is asking…', 5000), status(waiting))
  check('and proceeds once the account is granted', await says(waiting, 'will you marry me'), text(waiting))

  const refusedCalls = {}
  const refusedAccounts = open(URL_BASE, OWNER_A, { declineAccounts: true, calls: refusedCalls })
  await says(refusedAccounts, 'Ask her to marry you')
  typeAndAsk(refusedAccounts, OWNER_B.address)
  check('declining to share an account at Ask says nothing, Ask ready again',
    await until(() => refusedCalls.eth_requestAccounts === 1 && doc(refusedAccounts).getElementById('ask')?.disabled === false
      && status(refusedAccounts) === ''), status(refusedAccounts))

  const declined = open(URL_BASE, OWNER_A, { decline: true })
  await says(declined, 'Ask her to marry you')
  typeAndAsk(declined, OWNER_B.address)
  check('declining the signature re-enables Ask', await until(() => doc(declined).getElementById('ask')?.disabled === false && !status(declined).includes('asking')))
  check('and says nothing', status(declined) === '', status(declined))
  check('and keeps the typed address', doc(declined).getElementById('owner')?.value === OWNER_B.address)
}

export async function announced() {
  console.log('\nWallets that announce themselves')
  // No injected global: EIP-6963 is the only way to find this wallet.
  const only = open(URL_BASE, null, {}, { announce: [{ rdns: 'io.one', name: 'One', account: OWNER_A }] })
  await says(only, 'Ask her to marry you')
  typeAndAsk(only, OWNER_B.address)
  check('one announced wallet and no global is used without asking', await says(only, 'will you marry me'), text(only))

  // A second announcement under the same name cannot swap the wallet already found.
  const sameName = open(URL_BASE, null, {}, { announce: [
    { rdns: 'io.one', name: 'One', account: OWNER_A },
    { rdns: 'io.one', name: 'Impostor', account: STRANGER },
  ] })
  await says(sameName, 'Ask her to marry you')
  typeAndAsk(sameName, OWNER_B.address)
  check('a second announcement under the same name: the first wallet signs, nothing is asked',
    await says(sameName, 'will you marry me') && !text(sameName).includes('Impostor'), text(sameName))

  const both = open(URL_BASE, null, {}, {
    announce: [
      { rdns: 'io.one', name: 'One', account: OWNER_A },
      { rdns: 'io.two', name: 'Two', account: STRANGER },
    ],
  })
  await says(both, 'Ask her to marry you')
  typeAndAsk(both, OWNER_B.address)
  check('two announced wallets are asked about, not guessed between',
    await until(() => status(both).includes('Which wallet?')), status(both))
  const buttons = [...doc(both).querySelectorAll('[data-wallet]')]
  const named = buttons.map((b) => buttonName(b))
  check('each is offered by the name it gave, after the wallet emoji',
    named.join(',') === 'One,Two' && buttons.every((b) => b.querySelector('.symbol[aria-hidden="true"]')?.textContent === '👛'),
    buttons.map((b) => b.textContent).join(','))

  buttons.find((b) => b.getAttribute('data-wallet') === 'io.one').click()
  check('picking one presses the button again and proceeds', await says(both, 'will you marry me'), text(both))
  check('and the pick is kept for the tab', both.window.sessionStorage.getItem('wallet') === 'io.one')

  const calls = {}
  const twice = open(URL_BASE, null, {}, {
    announce: [
      { rdns: 'io.one', name: 'One', account: OWNER_A, opts: { calls } },
      { rdns: 'io.two', name: 'Two', account: STRANGER },
    ],
  })
  await says(twice, 'Ask her to marry you')
  typeAndAsk(twice, OWNER_B.address)
  await until(() => status(twice).includes('Which wallet?'))
  doc(twice).getElementById('ask').click()
  await until(() => status(twice).includes('Which wallet?'))
  doc(twice).querySelector('[data-wallet="io.one"]').click()
  await says(twice, 'will you marry me')
  check('asking twice before picking still sends one signature request',
    calls.eth_signTypedData_v4 === 1, `${calls.eth_signTypedData_v4} requests`)

  const same = open(URL_BASE, OWNER_A, {}, { announce: [{ rdns: 'io.one', name: 'One', account: OWNER_A }] })
  await says(same, 'Ask her to marry you')
  typeAndAsk(same, OWNER_B.address)
  check('one announced wallet that also injects is not a choice', await says(same, 'will you marry me'), text(same))
}

export async function noWalletAtAnswer(ctx) {
  const { link } = ctx
  console.log('\nNo wallet at the answer')
  const empty = open(link, null)
  await says(empty, 'Just say yes')
  check('the page says "No wallet."', text(empty).includes('No wallet.'), text(empty))
  check('and offers nothing to copy but the hash',
    [...doc(empty).querySelectorAll('[data-copy]')].every((el) => el.classList.contains('inscription')))
}

export async function walletsAtAnswer(ctx) {
  const { safe, link } = ctx
  console.log('\nWallet states at the answer')
  const impostor = open(link, OWNER_A)
  await says(impostor, 'Just say yes')
  doc(impostor).getElementById('go').click()
  await says(impostor, 'Your wallet is not on the right account.')
  check('the signer cannot answer: "Your wallet is not on the right account." under the button, with nothing else',
    doc(impostor).querySelector('#status .thorn')?.textContent === 'Your wallet is not on the right account.'
    && doc(impostor).querySelectorAll('#status p').length === 1,
    status(impostor))

  const outsider = open(link, STRANGER)
  await says(outsider, 'Just say yes')
  doc(outsider).getElementById('go').click()
  check('a key with no part in this cannot answer either',
    await says(outsider, 'Your wallet is not on the right account.'), text(outsider))

  const refusedCalls = {}
  const refusedAccounts = open(link, OWNER_B, { declineAccounts: true, calls: refusedCalls })
  await says(refusedAccounts, 'Just say yes')
  doc(refusedAccounts).getElementById('go').click()
  check('declining to share an account at Yes says nothing, Yes ready again',
    await until(() => refusedCalls.eth_requestAccounts === 1 && doc(refusedAccounts).getElementById('go')?.disabled === false
      && status(refusedAccounts) === ''), status(refusedAccounts))

  const declined = open(link, OWNER_B, { declineSend: true })
  await says(declined, 'Just say yes')
  doc(declined).getElementById('go').click()
  check('declining the transaction re-enables Yes',
    await until(() => doc(declined).getElementById('go')?.disabled === false && !status(declined).includes('asking')))
  check('and says nothing', status(declined) === '', status(declined))

  const pending = open(link, OWNER_B, { pendingSend: true })
  await says(pending, 'Just say yes')
  doc(pending).getElementById('go').click()
  check('a request already open in the wallet: "Your wallet is asking…" at Yes',
    await until(() => status(pending) === 'Your wallet is asking…'), status(pending))

  const offChain = open(link, OWNER_B, { chainId: 1 })
  await says(offChain, 'Just say yes')
  doc(offChain).getElementById('go').click()
  check('a wallet on another chain at Yes: "Your wallet is not on the right chain."',
    await until(() => status(offChain) === 'Your wallet is not on the right chain.'), status(offChain))

  const failingSend = open(link, OWNER_B, { failSend: true })
  await says(failingSend, 'Just say yes')
  doc(failingSend).getElementById('go').click()
  check('a wallet error at Yes: "It did not go through." under the button, Yes ready again',
    await until(() => doc(failingSend).querySelector('#status .thorn')?.textContent === 'It did not go through.'
      && doc(failingSend).getElementById('go')?.disabled === false), status(failingSend))

  const threshold = await pub.readContract({ address: safe, abi: SAFE_FULL_ABI, functionName: 'getThreshold' })
  check('none of that touched the Safe', threshold === 1n, `threshold ${threshold}`)
}
