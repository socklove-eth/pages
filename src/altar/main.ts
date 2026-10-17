/** Altar page: an owner signs a Safe batch adding a second owner, who then executes it. */
import { TransactionNotFoundError, getAddress, zeroAddress, type Hex } from 'viem'
import { getTransaction, readContract, signTypedData, waitForTransactionReceipt, writeContract } from 'viem/actions'
import { SAFE_ABI } from './lib/abi.ts'
import { ENS_NAME } from './lib/config.ts'
import { qrSvg } from './lib/qr.ts'
import { isLoopback } from './lib/registry.ts'
import { ADDRESS, TX_HASH, decodeHandoff, isHex, linkFor, lowS, validHandoff, type Handoff } from './lib/handoff.ts'
import { OWNER_KEY, RPC_KEY, SENT_KEY, load, save } from './lib/storage.ts'
import {
  bindField, byId, h, inputRow, p, panel, refuse, refuseField, setStatus, show, statusBox, symbol, term,
} from './lib/dom.ts'
import { copyAttrs, copyFallback, installCopy } from './lib/copy.ts'
import {
  NameUnset, ResolverMismatch, client, connectChain, endpointGeneration, forgetEndpoints, unreached, hashOf, includesAddress, onReached, readSafeState, safeTxFor, safeTxTypedData,
  signedByOwner, type SafeState,
} from './lib/chain.ts'
import {
  NoAccount, NoWallet, ReaderError, WalletChoice, askForWallet, askingNote, bindWalletEvents, connect, isPending,
  listenForWallets, noWalletNote, walletFor, wasDeclined,
} from './lib/wallet.ts'

const UNANSWERABLE = 'This Proposal cannot be answered.'
/** The Safe's owner-list sentinel. */
const SENTINEL = '0x0000000000000000000000000000000000000001'
const WRONG_ACCOUNT = 'Your wallet is not on the right account.'
const FAILED = 'It did not go through.'
const NOTHING = 'Nothing stands here yet.'
const MOVED = `This Page no longer reads ${ENS_NAME}.`

let shownHost = ''

/** A forgotten endpoint is no longer named. */
function forgetHost(): void {
  forgetEndpoints()
  shownHost = ''
  document.querySelector('.page-notice')?.replaceChildren()
}

/** Shows only the host: an endpoint's path may hold an API key. */
function showHost(url: string): void {
  let host = ''
  try {
    host = new URL(url).host
  } catch {
    return
  }
  if (!host || host === shownHost) return
  shownHost = host
  document.querySelector('.page-notice')?.replaceChildren(
    '☝️ The RPC endpoint, ',
    h('span', copyAttrs(host, 'Copy the RPC endpoint', 'inscription'), host),
    ', sees you ask.',
  )
}

/** True while a wallet call is open; a redraw would orphan its handler. */
let inFlight = false

function busy(on: boolean, id: string): void {
  inFlight = on
  const btn = byId(id, HTMLButtonElement)
  if (btn) btn.disabled = on
}

/** Wallets do not display the SafeTxHash, so the page shows it for comparison. */
const hashLine = (hash: Hex): HTMLElement =>
  h('div', { class: 'copy' },
    p('caption', 'Verify this transaction hash:'),
    h('div', copyAttrs(hash, 'Copy the transaction hash', 'inscription'), hash),
    copyFallback())

let state: SafeState | null = null

function renderAsk(r: SafeState): void {
  const kept = load(OWNER_KEY) ?? ''
  save(OWNER_KEY, null)
  show(
    p('lead', 'Ask her to marry you and put the ', ...term('💍', 'Ring'), ' on her finger.'),
    inputRow('owner', 'Sockthief’s address', 'Insert Sockthief’s address…', kept),
    h('button', { class: 'step vow', type: 'button', id: 'ask' }, symbol('🧎'), 'Ask'),
    statusBox(),
    ...noWalletNote(),
  )

  bindField('owner', 'ask')
  document.getElementById('ask')!.addEventListener('click', () => {
    setStatus()
    const input = byId('owner', HTMLInputElement)
    if (!input) return
    const newOwner = input.value.trim()
    // The Safe could never add the zero address, its sentinel, itself or an owner: such a batch only reverts.
    if (!ADDRESS.test(newOwner) || getAddress(newOwner) !== newOwner
      || [zeroAddress, SENTINEL, r.safe.toLowerCase()].includes(newOwner.toLowerCase()) || includesAddress(r.owners, getAddress(newOwner))) {
      input.value = ''
      // Marked before focus, so a screen reader announces the field as invalid.
      refuseField(input)
      input.focus()
      return
    }
    save(OWNER_KEY, newOwner)
    void sign({ safe: r.safe, newOwner, nonce: String(r.nonce) }, r)
  })
}

/** The signed link leaves this screen only as a QR code. */
function renderHandoff(handoff: Handoff, r: SafeState): void {
  show(
    p('lead', ...term('🧦', 'Sockthief'), ', will you marry me?'),
    hashLine(hashOf(handoff, r.resolver)),
    h('div', { class: 'qr' }, qrSvg(linkFor(location.href, handoff))),
  )
}

/**
 * An unset or moved name ends the Page, whenever it is read; read through an endpoint you supplied,
 * the prompt shows what it read and lets you try another, since that endpoint may be the one that is
 * wrong. False for any other error.
 */
function nameGone(e: unknown, justTyped = false): boolean {
  const read = e instanceof NameUnset ? NOTHING : e instanceof ResolverMismatch ? MOVED : ''
  if (!read) return false
  stopWatching()
  if (load(RPC_KEY) !== null) rpcFailed(justTyped, read)
  else if (e instanceof NameUnset) show(p('note', NOTHING))
  // A pinned Page never follows a moved name.
  else refuse(MOVED)
  return true
}

/** A declined request is not an error. */
function walletFailed(e: unknown, buttonId: string): void {
  if (nameGone(e)) return
  if (unreached(e)) return rpcFailed()
  if (wasDeclined(e) || e instanceof NoAccount || e instanceof NoWallet) setStatus()
  else if (e instanceof WalletChoice) askForWallet(buttonId)
  else if (isPending(e)) setStatus(askingNote())
  else setStatus(p('thorn', e instanceof ReaderError ? e.message : FAILED))
}

/** A frozen screen may hold an old Nonce: if it moved, redraw rather than sign or send for it. */
async function nonceMoved(r: SafeState): Promise<boolean> {
  const nonce = await readContract(client, { address: r.safe, abi: SAFE_ABI, functionName: 'nonce' })
  // Only a higher Nonce moved: a lagging node may report an older one.
  if (nonce <= r.nonce) return false
  state = await readSafeState()
  await render(state)
  return true
}

async function sign(handoff: Handoff, r: SafeState): Promise<void> {
  busy(true, 'ask')
  try {
    const account = await connect(r.owners)
    if (!includesAddress(r.owners, account)) {
      setStatus(p('thorn', WRONG_ACCOUNT))
      return
    }
    if (await nonceMoved(r)) return
    setStatus(askingNote())
    const raw = await signTypedData(walletFor(account), { account, ...safeTxTypedData(handoff, r.resolver) })
    // Some signers (MetaMask with a Ledger) return v as 0 or 1; the Safe needs 27 or 28.
    const sig = lowS(raw.replace(/0([01])$/, (_, v: string) => (Number(v) + 27).toString(16)))
    // Recovered before it is shown: a signature no owner made would only make a link no one can answer.
    const signed = validHandoff({ ...handoff, sig })
    if (!signed || !(await signedByOwner(signed, r))) throw new Error('unusable signature')
    save(OWNER_KEY, null)
    renderHandoff(signed, r)
  } catch (e) {
    walletFailed(e, 'ask')
  } finally {
    busy(false, 'ask')
  }
}

/** Verifies the link's signature against current owners, then lets the new owner execute. */
async function renderAnswer(r: SafeState, handoff: Handoff): Promise<void> {
  // Every failed check gets the same line: the remedy is always a new link.
  const hash = await signedByOwner(handoff, r)
  const sig = handoff.sig
  if (!hash || !sig) return refuse(UNANSWERABLE)

  // A reload while a send is pending waits for it again, however the link is written: the send is
  // kept under the SafeTx's hash. Only a send the chain keeps not knowing was dropped.
  const [sentFor, sentTx, sentAt] = (load(SENT_KEY) ?? '').split(' ')
  if (sentFor === hash && isHex(sentTx, TX_HASH)) {
    show(p('note', 'Waiting for the chain…'))
    const verdict = await sendStands(sentTx, r, Math.min(Number(sentAt) || Date.now(), Date.now()))
    // The Nonce moved: the send, or another, landed, and the chain's state says which screen; a
    // lagging endpoint that still reports the old Nonce is not believed, and the wait goes on.
    const next = verdict === 'moved' ? await readSafeState() : null
    if (verdict === 'stands' || (next && next.nonce <= r.nonce)) {
      void settle(sentTx, r)
      return
    }
    save(SENT_KEY, null)
    if (next) {
      state = next
      return render(next)
    }
  }

  show(
    p('lead', 'Just say yes and put on the ', ...term('💍', 'Ring'), '.'),
    hashLine(hash),
    h('button', { class: 'step vow', type: 'button', id: 'go' }, symbol('💜'), 'Yes'),
    statusBox(),
    ...noWalletNote(),
  )

  document.getElementById('go')!.addEventListener('click', async () => {
    busy(true, 'go')
    // Once sent, this handler is done with the button: a later screen's button is not its own.
    let sent = false
    try {
      const account = await connect([handoff.newOwner])
      // At threshold 1 the signer could execute alone; this check prevents it.
      if (account.toLowerCase() !== handoff.newOwner.toLowerCase()) {
        setStatus(p('thorn', WRONG_ACCOUNT))
        return
      }
      if (await nonceMoved(r)) return
      setStatus(askingNote())
      const m = safeTxFor(handoff, r.resolver)
      const tx = await writeContract(walletFor(account), {
        address: r.safe,
        abi: SAFE_ABI,
        functionName: 'execTransaction',
        args: [m.to, m.value, m.data, m.operation, m.safeTxGas, m.baseGas, m.gasPrice, m.gasToken, m.refundReceiver, sig],
        account,
      })
      // Sent: from here nothing re-arms Yes, and a reload waits for the send for as long as a private route holds one.
      save(SENT_KEY, `${hash} ${tx} ${Date.now()}`)
      sent = true
      show(p('note', 'Waiting for the chain…'))
      inFlight = false
      await settle(tx, r)
    } catch (e) {
      walletFailed(e, 'go')
    } finally {
      if (!sent) busy(false, 'go')
    }
  })
}

/** A private route holds a send unseen for 25 blocks by default, about five minutes; this outlasts it. */
const DROPPED_AFTER_MS = 360_000

/**
 * 'stands' unless the endpoint keeps answering that it does not know the send, with the Nonce
 * unmoved, until DROPPED_AFTER_MS after it was sent; then 'dropped'. Any read that fails stands.
 * 'moved' when the Nonce moved: something landed, and the chain's state says what.
 */
async function sendStands(tx: Hex, r: SafeState, sentAt: number): Promise<'stands' | 'dropped' | 'moved'> {
  for (;;) {
    try {
      await getTransaction(client, { hash: tx })
      return 'stands'
    } catch (e) {
      if (!(e instanceof TransactionNotFoundError)) return 'stands'
    }
    try {
      if ((await readContract(client, { address: r.safe, abi: SAFE_ABI, functionName: 'nonce' })) > r.nonce) return 'moved'
    } catch {
      return 'stands'
    }
    if (Date.now() - sentAt >= DROPPED_AFTER_MS) return 'dropped'
    await new Promise((resolve) => setTimeout(resolve, 12_000))
  }
}

/** Reads until one succeeds, a few times: a receipt in hand is worth more than one failed read. */
async function persist<T>(read: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await read()
    } catch (e) {
      if (i >= tries) throw e
      await new Promise((r) => setTimeout(r, 4000))
    }
  }
}

/**
 * Waits, without a timeout, for the receipt of the send or of what replaced it, then reads the
 * Safe in that receipt's own block, canonical only, so neither a lagging node nor a reorg can
 * misreport it. Until then the Nonce watch may draw the done screen first, and it stays drawn.
 * Reads that keep failing leave the wait standing. A wait whose endpoints were forgotten asks them
 * nothing more; it ends, or lies idle, and the wait the next connection starts, from the kept send,
 * takes over.
 */
async function settle(tx: Hex, r: SafeState): Promise<void> {
  const began = endpointGeneration()
  const forgotten = () => endpointGeneration() !== began
  try {
    // One failed or lagging poll ends viem's wait, so it is waited for again until it holds; a
    // forgotten endpoint fails every request at once, unsent, though viem may hold the wait open.
    let receipt
    for (;;) {
      try {
        receipt = await waitForTransactionReceipt(client, { hash: tx, confirmations: 1, timeout: 0 })
        break
      } catch {
        if ((state && state.threshold !== 1n) || forgotten()) return
        await new Promise((resolve) => setTimeout(resolve, 4000))
      }
      if (forgotten()) return
    }
    if (forgotten()) return
    const threshold = await persist(() => readContract(client, {
      address: r.safe, abi: SAFE_ABI, functionName: 'getThreshold', blockHash: receipt.blockHash, requireCanonical: true,
    }))
    if (forgotten()) return
    save(SENT_KEY, null)
    if ((state && state.threshold !== 1n) || !safeToRedraw()) return
    if (threshold !== 1n) {
      // Clear the hash first, or the spent handoff would render as stale.
      history.replaceState(null, '', location.pathname + location.search)
      state = { ...r, threshold }
      return render(state)
    }
    // Something else was mined in its place (a revert, a replacement, a cancel): the Answer again.
    const next = await persist(readSafeState)
    if ((state && state.threshold !== 1n) || forgotten() || !safeToRedraw()) return
    state = next
    await render(state)
    setStatus(p('thorn', FAILED))
  } catch (e) {
    // Already sent: never reported as failed, but a moved or unset name still ends the Page, at
    // 1-of-1 and where a redraw is safe: never over the done screen or the RPC prompt.
    if (safeToRedraw() && state?.threshold === 1n) nameGone(e)
  }
}

// Set by Connect, read once by the next main(): its failure answers what was just typed.
let connecting = false

/**
 * A typed endpoint that fails or answers for another chain is forgotten and marked; one that read
 * the name unset or moved is forgotten too, and what it read is shown, so another can be tried.
 */
function rpcFailed(justTyped = false, read = ''): void {
  stopWatching()
  const typed = load(RPC_KEY) !== null
  if (typed) {
    save(RPC_KEY, null)
    forgetHost()
  }
  askForRpc(typed && !read, justTyped, read)
}

/**
 * Shows what a supplied endpoint read, if it read the name unset or moved; else a refused endpoint
 * marks the field, and says so unless Connect was just pressed; else the built-in endpoints failed.
 */
function askForRpc(refused: boolean, justTyped = false, read = ''): void {
  show(
    p('lead', 'Enter your own RPC endpoint:'),
    inputRow('rpc', 'RPC endpoint', 'Insert RPC endpoint…'),
    h('button', { class: 'step way', type: 'button', id: 'retry' }, symbol('🔌'), 'Connect'),
    statusBox(),
  )
  const entry = byId('rpc', HTMLInputElement)
  if (read) setStatus(p('note', read))
  else if (refused && entry) {
    refuseField(entry)
    // Focus brings the field's invalid mark to a screen reader, as a refused Connect does.
    if (justTyped) entry.focus()
    else setStatus(p('thorn', 'Your RPC endpoint was not reached.'))
  } else setStatus(p('thorn', 'No public RPC endpoint was reached.'))

  bindField('rpc', 'retry')
  document.getElementById('retry')!.addEventListener('click', () => {
    setStatus()
    const field = byId('rpc', HTMLInputElement)
    const value = field?.value.trim() ?? ''
    let parsed: URL | null = null
    try {
      parsed = new URL(value)
    } catch {
      /* refused below */
    }
    // https anywhere; plain http only on loopback, the one place the CSP lets it reach.
    if (!field || !parsed || (parsed.protocol !== 'https:' && !isLoopback(parsed))) {
      if (field) {
        field.value = ''
        refuseField(field)
        field.focus()
      }
      return
    }
    save(RPC_KEY, value)
    connecting = true
    void main()
  })
}

async function render(r: SafeState): Promise<void> {
  if (r.threshold !== 1n) {
    stopWatching()
    show(p('lead bond', 'She said yes. The ', ...term('💍', 'Ring'), ' is whole.'))
    return
  }
  const linked = decodeHandoff(location.hash)
  if (linked) return renderAnswer(r, linked)
  if (location.hash.replace(/^#/, '').trim()) return refuse(UNANSWERABLE)
  // The Handoff screen lasts until a reload, or until the Nonce watch draws Ask or the done screen.
  renderAsk(r)
}

let watchTimer: ReturnType<typeof setInterval> | undefined

function stopWatching(): void {
  clearInterval(watchTimer)
  watchTimer = undefined
}

/** Never redraw over an open wallet call, typed input or a status message. */
function safeToRedraw(): boolean {
  if (inFlight) return false
  if (Array.from(panel().querySelectorAll('input')).some((f) => f.value.trim())) return false
  return !document.getElementById('status')?.textContent?.trim()
}

const WATCH_MS = 300_000

/** A hidden tab skips its reads and reads once when shown again. */
function watch(): void {
  if (watchTimer !== undefined || state?.threshold !== 1n) return
  watchTimer = setInterval(() => {
    if (!document.hidden) void checkNonce()
  }, WATCH_MS)
}

function installWatch(): void {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && watchTimer !== undefined) void checkNonce()
  })
}

/** Owner and threshold changes always bump the nonce, so reading it suffices. */
async function checkNonce(): Promise<void> {
  if (!state || !safeToRedraw()) return
  let next: SafeState
  try {
    const nonce = await readContract(client, { address: state.safe, abi: SAFE_ABI, functionName: 'nonce' })
    if (nonce <= state.nonce) return
    next = await readSafeState()
  } catch (e) {
    // A moved name is said only where a redraw is safe, at 1-of-1; the next read says it otherwise.
    if (safeToRedraw() && state.threshold === 1n) nameGone(e)
    return
  }
  // The done screen is final, and a lagging node's older state never replaces a newer one.
  if (!safeToRedraw() || state.threshold !== 1n || next.nonce <= state.nonce) return
  state = next
  await render(next).catch((e: unknown) => nameGone(e) || fail())
}

function fail(): void {
  stopWatching()
  refuse('Something went wrong.')
}

async function main(): Promise<void> {
  const justTyped = connecting
  connecting = false
  show(p('note', 'Reading the chain…'))
  try {
    await connectChain()
    state = await readSafeState()
  } catch (e) {
    if (nameGone(e, justTyped)) return
    return rpcFailed(justTyped)
  }
  try {
    await render(state)
  } catch (e) {
    if (nameGone(e)) return
    return fail()
  }
  watch()
}

/** frame-ancestors is ignored in a <meta> CSP, so framing is refused here. */
function framed(): boolean {
  try {
    return self !== top
  } catch {
    return true
  }
}

/** A path gateway serves every CID from one origin, which could then script this page; gateways decode `%69pfs` too. */
function onSharedGateway(): boolean {
  try {
    return /\/ip[fn]s\//i.test(decodeURIComponent(location.pathname))
  } catch {
    return true
  }
}
// Every file:// page shares one storage, so another local file could read what the tab keeps.
if (framed() || onSharedGateway() || location.protocol === 'file:') {
  show(p('note', 'This Page cannot run here.'))
  document.querySelector('.page-notice')?.remove()
} else {
  onReached(showHost)
  installCopy()
  installWatch()
  listenForWallets()
  bindWalletEvents()
  addEventListener('hashchange', () => {
    if (state) location.reload()
  })
  void main()
}
