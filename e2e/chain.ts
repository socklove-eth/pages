import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { encodeFunctionData, namehash, parseAbi } from 'viem'
import { pageConfig } from '../scripts/env.mjs'

/** What global-setup staged, for the specs and global-teardown. */
export const STATE = fileURLToPath(new URL('./.staged.json', import.meta.url))

export const staged = () =>
  JSON.parse(readFileSync(STATE, 'utf8')) as {
    rpc: string
    safe: `0x${string}`
    ownerA: `0x${string}`
    ownerB: `0x${string}`
    snapshot: string
  }

export async function rpcCall(method: string, params: unknown[] = [], rpc = staged().rpc): Promise<unknown> {
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const { result, error } = await res.json()
  if (error) throw new Error(`${method}: ${error.message}`)
  return result
}

/** stage.mjs reads ANVIL_RPC at module load, so it is set before the import. */
export async function loadStage(rpc = staged().rpc) {
  process.env.ANVIL_RPC = rpc
  return import('../localnet/stage.mjs')
}

/** Puts the chain back as global-setup staged it: the Safe 1-of-1 at Nonce 0. */
export async function freshChain(): Promise<void> {
  const state = staged()
  await rpcCall('evm_revert', [state.snapshot])
  // A snapshot is spent by reverting to it.
  writeFileSync(STATE, JSON.stringify({ ...state, snapshot: await rpcCall('evm_snapshot') }, null, 2))
}

/** Points the name at another resolver, as the Safe itself could: every endpoint then names it. */
export async function moveResolver(): Promise<void> {
  const { safe } = staged()
  const { name, registry } = pageConfig(fileURLToPath(new URL('..', import.meta.url)))
  const data = encodeFunctionData({
    abi: parseAbi(['function setResolver(bytes32 node, address resolver)']),
    functionName: 'setResolver',
    args: [namehash(name), '0x000000000000000000000000000000000000dEaD'],
  })
  await rpcCall('anvil_impersonateAccount', [safe])
  await rpcCall('anvil_setBalance', [safe, '0xDE0B6B3A7640000'])
  await rpcCall('eth_sendTransaction', [{ from: safe, to: registry, data }])
  await rpcCall('anvil_stopImpersonatingAccount', [safe])
}

/** Moves the Safe's Nonce (Safe 1.4.1 keeps it in slot 5), as another transaction would. */
export async function bumpNonce(): Promise<void> {
  const { safe } = staged()
  const nonce = BigInt((await rpcCall('eth_getStorageAt', [safe, '0x5', 'latest'])) as string)
  await rpcCall('anvil_setStorageAt', [safe, '0x5', `0x${(nonce + 1n).toString(16).padStart(64, '0')}`])
}
