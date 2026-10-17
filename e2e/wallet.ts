import type { Page } from '@playwright/test'
import { createWalletClient, createPublicClient, http, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'
import { DEV_KEYS } from '../localnet/keys.mjs'
import { scan } from '../localnet/scan.mjs'
import { staged } from './chain'

/** The signed link, read from the QR code on the Handoff screen, as a phone would. */
export async function scannedLink(page: Page): Promise<string> {
  const { d, size } = await page.locator('.qr svg').evaluate((svg) => ({
    d: svg.querySelector('path')!.getAttribute('d')!,
    size: Number(svg.getAttribute('viewBox')!.split(' ')[2]),
  }))
  return scan(d, size)
}

type Key = keyof Pick<typeof DEV_KEYS, 'A' | 'B'>

export interface WalletOptions {
  /** Key that signs and sends. */
  account: Key
  /** Account already granted to the origin; may differ from `account`. */
  granted?: Key
  /** Reject every signature and transaction (4001). */
  decline?: boolean
  /** Answer every request with -32002, like an unanswered popup. */
  pending?: boolean
  /** The chain the wallet is on; the local chain unless set. */
  chain?: number
  /** Reject a request to switch chains (4001). */
  declineSwitch?: boolean
  /** Fail a request to switch chains, as a wallet without that chain does (4902). */
  failSwitch?: boolean
  /** Refuse the account picker (4001). */
  declinePicker?: boolean
  /** Answer every signature with bytes no Safe accepts. */
  badSignature?: boolean
  /** Hold every transaction open until `release()` is called. */
  holdSend?: boolean
  /** Announce through EIP-6963 under these names, one provider each, instead of window.ethereum. */
  announce?: string[]
  /** Leave the Page's own endpoints alone; by default the tab is pointed at the staged chain. */
  keepEndpoints?: boolean
}

/** Injects an EIP-1193 provider as `window.ethereum`, backed by viem in Node. */
export async function installWallet(page: Page, opts: WalletOptions) {
  const { rpc } = staged()
  const account = privateKeyToAccount(DEV_KEYS[opts.account])
  const client = createWalletClient({ account, chain: foundry, transport: http(rpc) })
  const reader = createPublicClient({ chain: foundry, transport: http(rpc) })

  let accounts: string[] = [privateKeyToAccount(DEV_KEYS[opts.granted ?? opts.account]).address]
  const calls: string[] = []
  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))

  await page.exposeFunction('__wallet', async (method: string, params: unknown[]) => {
    calls.push(method)
    if (opts.pending) throw { code: -32002, message: 'Request of type already pending.' }

    switch (method) {
      case 'eth_accounts':
      case 'eth_requestAccounts':
        return accounts
      // Answering the picker grants the account actually selected.
      case 'wallet_requestPermissions':
        if (opts.declinePicker) throw { code: 4001, message: 'User rejected the request.' }
        accounts = [account.address]
        return [{ parentCapability: 'eth_accounts' }]
      case 'eth_chainId':
        return toHex(opts.chain ?? foundry.id)
      case 'wallet_switchEthereumChain':
        if (opts.declineSwitch) throw { code: 4001, message: 'User rejected the request.' }
        if (opts.failSwitch) throw { code: 4902, message: 'Unrecognized chain ID.' }
        return null
      case 'eth_sendTransaction': {
        if (opts.decline) throw { code: 4001, message: 'User rejected the request.' }
        const [tx] = params as [{ to: `0x${string}`; data: `0x${string}`; value?: string }]
        if (opts.holdSend) await held
        return client.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n })
      }
      case 'eth_signTypedData_v4': {
        if (opts.decline) throw { code: 4001, message: 'User rejected the request.' }
        if (opts.badSignature) return '0x1234'
        const [, raw] = params as [string, string | object]
        const typed = typeof raw === 'string' ? JSON.parse(raw) : raw
        // JSON has no bigints, so uint fields arrive as strings.
        const message: Record<string, unknown> = { ...typed.message }
        for (const k of ['value', 'safeTxGas', 'baseGas', 'gasPrice', 'nonce']) {
          if (message[k] !== undefined) message[k] = BigInt(message[k] as string)
        }
        if (message.operation !== undefined) message.operation = Number(message.operation)
        const domain = { ...typed.domain }
        if (domain.chainId !== undefined) domain.chainId = Number(domain.chainId)
        return account.signTypedData({
          domain,
          types: typed.types,
          primaryType: typed.primaryType,
          message,
        })
      }
      default:
        return reader.request({ method, params } as never)
    }
  })

  // Installed before page scripts run, as an extension's provider would be.
  await page.addInitScript(
    ({ rpcUrl, announce }) => {
      const listeners: Record<string, ((...a: unknown[]) => void)[]> = {}
      const provider = {
        isMetaMask: true,
        request: ({ method, params }: { method: string; params?: unknown[] }) =>
          (window as any).__wallet(method, params ?? []),
        on(event: string, fn: (...a: unknown[]) => void) {
          ;(listeners[event] ??= []).push(fn)
        },
        removeListener(event: string, fn: (...a: unknown[]) => void) {
          listeners[event] = (listeners[event] ?? []).filter((f) => f !== fn)
        },
        emit(event: string, ...args: unknown[]) {
          for (const fn of listeners[event] ?? []) fn(...args)
        },
      }
      if (announce) {
        const announceAll = () =>
          announce.forEach((name, i) =>
            dispatchEvent(
              new CustomEvent('eip6963:announceProvider', {
                detail: Object.freeze({ info: { uuid: `test-${i}`, name, icon: 'data:,', rdns: `test.wallet.${i}` }, provider }),
              }),
            ),
          )
        addEventListener('eip6963:requestProvider', announceAll)
        announceAll()
      } else {
        ;(window as any).ethereum = provider
      }
      // The page reads before any wallet connects, so it needs an endpoint.
      if (rpcUrl) {
        try {
          sessionStorage.setItem('rpc', rpcUrl)
        } catch {
          /* storage blocked */
        }
      }
    },
    { rpcUrl: opts.keepEndpoints ? null : rpc, announce: opts.announce ?? null },
  )
  return { calls, release }
}

/** Fires an EIP-1193 event, as an extension does on account or chain switch. */
export const emit = (page: Page, event: string, ...args: unknown[]) =>
  page.evaluate(([e, a]) => (window as any).ethereum.emit(e, ...a), [event, args] as const)
