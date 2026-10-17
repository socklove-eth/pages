/** Per-tab state in sessionStorage. */
export const RPC_KEY = 'rpc'
export const WALLET_KEY = 'wallet'
/** The address being asked, kept across the reload a chain switch causes. */
export const OWNER_KEY = 'owner'
/** A sent Yes: its SafeTx hash, the transaction and when, so a reload waits for it instead of offering Yes again. */
export const SENT_KEY = 'sent'

/** Stands in for sessionStorage where the browser blocks it, for as long as the page is open. */
const memory = new Map<string, string>()

export function load(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return memory.get(key) ?? null
  }
}

export function save(key: string, value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
  } catch {
    if (value === null) memory.delete(key)
    else memory.set(key, value)
  }
}
