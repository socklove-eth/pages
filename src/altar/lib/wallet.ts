/** The wallet: EIP-6963 discovery, connecting, and the errors a wallet raises. */
import { createClient, custom, type Address, type EIP1193Provider } from 'viem'
import { CHAINS, chainId, includesAddress } from './chain.ts'
import { WALLET_KEY, load, save } from './storage.ts'
import { byId, h, p, setStatus, symbol, targetOf } from './dom.ts'

interface AnnouncedWallet {
  info: { rdns: string; name: string }
  provider: EIP1193Provider
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider
  }
  interface WindowEventMap {
    'eip6963:announceProvider': CustomEvent<AnnouncedWallet | undefined>
  }
}

/** EIP-6963 announced wallets by rdns, so with several installed the user picks. */
const announced = new Map<string, { name: string; provider: EIP1193Provider }>()

export function listenForWallets(): void {
  addEventListener('eip6963:announceProvider', (e) => {
    const d = e.detail
    // The first announcement under a wallet ID (rdns) is kept: a later one could swap the provider picked.
    if (!d?.info?.rdns || !d.provider || announced.has(d.info.rdns)) return
    announced.set(d.info.rdns, { name: d.info.name, provider: d.provider })
    bindWalletEvents()
    // A wallet that announces after the screen was drawn makes its "No wallet." untrue.
    document.querySelector('.no-wallet')?.remove()
  })
  dispatchEvent(new Event('eip6963:requestProvider'))
}

/** Several wallets announced and none picked yet. */
export class WalletChoice extends Error {}

function chosenWallet(): EIP1193Provider | undefined {
  const picked = load(WALLET_KEY)
  if (picked && announced.has(picked)) return announced.get(picked)!.provider
  if (announced.size === 1) return [...announced.values()][0]?.provider
  return undefined
}

/** An error written for the reader, shown as it is. */
export class ReaderError extends Error {}

/** The wallet shared no account: treated like a declined request, silently. */
export class NoAccount extends Error {}

/** No wallet to ask: the screen already says so, so pressing adds nothing. */
export class NoWallet extends Error {}

function provider(): EIP1193Provider {
  // With several announced, window.ethereum is just one of them: ask instead.
  if (!chosenWallet() && announced.size > 1) throw new WalletChoice('more than one wallet')
  const eth = chosenWallet() ?? window.ethereum
  if (!eth) throw new NoWallet()
  return eth
}

export function noWalletNote(): Node[] {
  if (announced.size > 0 || window.ethereum) return []
  return [p('note no-wallet', 'No wallet.')]
}

/** Lets the user pick a wallet (kept per tab), then re-clicks the button. */
export function askForWallet(buttonId: string): void {
  const buttons = [...announced.entries()].flatMap(([rdns, w], i) => [
    i ? ' ' : '',
    h('button', { class: 'step way', type: 'button', 'data-wallet': rdns }, symbol('👛'), w.name),
  ])
  setStatus(p('note', 'Which wallet?'), h('div', { class: 'crossroads' }, ...buttons))
  const status = document.getElementById('status')
  if (!status) return
  // Assigned, not added, so asking twice does not bind a second handler.
  status.onclick = (e) => {
    const rdns = targetOf(e)?.closest('[data-wallet]')?.getAttribute('data-wallet')
    if (!rdns) return
    save(WALLET_KEY, rdns)
    setStatus()
    bindWalletEvents()
    byId(buttonId, HTMLButtonElement)?.click()
  }
}

let bound: EIP1193Provider | undefined
const onAccountsChanged = (): void => setStatus()
// A chain switch invalidates all state; reload rather than carry it over.
const onChainChanged = (): void => location.reload()

/** Binds events to the wallet in use, which under EIP-6963 may not be window.ethereum. */
export function bindWalletEvents(): void {
  const eth = chosenWallet() ?? window.ethereum
  if (eth === bound) return
  bound?.removeListener?.('accountsChanged', onAccountsChanged)
  bound?.removeListener?.('chainChanged', onChainChanged)
  bound = eth
  eth?.on?.('accountsChanged', onAccountsChanged)
  eth?.on?.('chainChanged', onChainChanged)
}

/** Walks the error's `cause` chain, bounded in case of a cycle. */
function hasCode(e: unknown, test: (o: { code?: unknown; name?: unknown }) => boolean): boolean {
  let node: unknown = e
  for (let depth = 0; depth < 8 && typeof node === 'object' && node !== null; depth++) {
    if (test(node)) return true
    node = (node as { cause?: unknown }).cause
  }
  return false
}

export const wasDeclined = (e: unknown) => hasCode(e, (o) => o.code === 4001 || o.name === 'UserRejectedRequestError')

/** EIP-1193 -32002: the wallet already has a pending request. */
export const isPending = (e: unknown) => hasCode(e, (o) => o.code === -32002)

export const askingNote = (): Node => p('small', 'Your wallet is asking…')

const accountsNow = async (): Promise<Address[]> =>
  (await provider().request({ method: 'eth_accounts' })) ?? []

async function waitForAccounts(timeoutMs: number): Promise<Address[]> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    try {
      const accounts = await accountsNow()
      if (accounts.length) return accounts
    } catch {
      /* keep polling */
    }
  }
  return []
}

/** Wallets grant accounts per site; if the granted one is not wanted, open the account picker. */
export async function connect(wanted: readonly Address[]): Promise<Address> {
  let accounts = await accountsNow()
  if (!accounts.length) {
    setStatus(askingNote())
    try {
      accounts = await provider().request({ method: 'eth_requestAccounts' })
    } catch (e) {
      if (!isPending(e)) throw e
      setStatus(askingNote())
      accounts = await waitForAccounts(60_000)
      if (!accounts.length) throw e
    }
  }
  let account = accounts[0]
  if (!account) throw new NoAccount()

  if (!includesAddress(wanted, account)) {
    setStatus(askingNote())
    try {
      await provider().request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] })
    } catch (e) {
      if (wasDeclined(e) || isPending(e)) throw e
    }
    account = (await accountsNow().catch(() => [])).find((a) => includesAddress(wanted, a)) ?? account
  }

  const walletChain = await provider().request({ method: 'eth_chainId' })
  if (parseInt(walletChain, 16) !== chainId) {
    // Any chain change reloads the page, so the user presses again on the right chain.
    setStatus(askingNote())
    try {
      await provider().request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${chainId.toString(16)}` }] })
      location.reload()
      return await new Promise<never>(() => {})
    } catch (e) {
      if (wasDeclined(e) || isPending(e)) throw e
    }
    throw new ReaderError('Your wallet is not on the right chain.')
  }
  return account
}

export const walletFor = (account: Address) =>
  createClient({ chain: CHAINS[chainId]!, transport: custom(provider()), account, ccipRead: false })
