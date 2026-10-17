/** The chain connection and the Safe's state, read through the ENS name. */
import {
  BaseError,
  HttpRequestError,
  TimeoutError,
  createClient,
  fallback,
  http,
  hashTypedData,
  namehash,
  recoverAddress,
  zeroAddress,
  type Address,
  type Chain,
  type Client,
  type Hex,
  type Transport,
} from 'viem'
import { getChainId, getCode, readContract } from 'viem/actions'
import { foundry, mainnet } from 'viem/chains'
import { ENS_LABEL, ENS_NAME, ENS_REGISTRY_WITH_FALLBACK, ENS_PUBLIC_RESOLVER, SAFE, SAFE_MULTI_SEND_CALL_ONLY } from './config.ts'
import { ENS_REGISTRY_WITH_FALLBACK_ABI, ENS_PUBLIC_RESOLVER_ABI, SAFE_ABI } from './abi.ts'
import { SAFE_TX_TYPES, safeTxDomain } from './safeTx.ts'
import { batchSafeTx } from './batch.ts'
import { RPC_ENDPOINTS_TEXT_KEY, WrongChain, endpointsFrom, fetchWhole, onChain } from './registry.ts'
import type { Handoff } from './handoff.ts'
import { RPC_KEY, load } from './storage.ts'

export const CHAINS: Record<number, typeof mainnet | typeof foundry> = { 1: mainnet, 31337: foundry }

const SAFE_THRESHOLD = 2

/** Inlined from .env at build time; lan.mjs finds this array by name in the built page. */
declare const __RPC_URLS__: string[]
const RPC_URLS: readonly string[] = __RPC_URLS__

export let client: Client<Transport, Chain>
export let chainId = 1

let reached: (url: string) => void = () => {}

export function onReached(fn: (url: string) => void): void {
  reached = fn
}

// Each connect, and each forgotten endpoint, starts a generation: a late answer from an older one names nobody.
let generation = 0

/** Endpoints made before this call no longer name themselves in the notice. */
export function forgetEndpoints(): void {
  generation++
}

/** The current generation: a wait that began under another reads through endpoints since forgotten. */
export const endpointGeneration = (): number => generation

/** `trusted` holds back the notice until the endpoint has proved itself. */
const endpoint = (url: string, trusted: () => boolean) => {
  const made = generation
  return http(url, {
    timeout: 4000, retryCount: 1,
    // A forgotten endpoint is asked nothing more: every request a wait still holding it makes fails at once, unsent.
    fetchFn: (input, init) => (made === generation ? fetchWhole(input, init) : Promise.reject(new Error('This endpoint was forgotten.'))),
    onFetchResponse: (response) => (response.ok && trusted() && made === generation ? reached(url) : undefined),
  })
}

/** Asks which chain the endpoints answer for, naming none of them: the chain may be one Altar does not run on. */
const transportFor = (urls: readonly string[]) => fallback(urls.map((url) => endpoint(url, () => false)))

/** An endpoint held to the chain, named in the notice only once it has answered for it. */
function checked(url: string, id: number, retry: boolean): Transport {
  let trusted = false
  return onChain(endpoint(url, () => trusted), id, () => { trusted = true }, retry)
}

/** The initial endpoints, each held to the chain: a later failover cannot read another one. */
const heldTo = (urls: readonly string[], id: number) => urls.map((url) => checked(url, id, true))

/** A user-supplied endpoint replaces the baked set rather than heading it. */
function initialUrls(): string[] {
  const supplied = load(RPC_KEY)
  return supplied ? [supplied] : [...RPC_URLS]
}

/** No endpoint answered: a different RPC endpoint may help. */
export const unreached = (e: unknown): boolean =>
  e instanceof WrongChain
  || (e instanceof BaseError && e.walk((c) => c instanceof HttpRequestError || c instanceof TimeoutError || c instanceof WrongChain) !== null)

/** Nothing stands here: the Safe has no code, or the ENS name is unset; a different RPC endpoint will not help. */
export class NameUnset extends Error {}

/** The name answers through another resolver, or for another Safe, than this Page was built with. */
export class ResolverMismatch extends Error {}

export async function connectChain(): Promise<void> {
  forgetEndpoints()
  const urls = initialUrls()
  chainId = await getChainId(createClient({ chain: mainnet, transport: transportFor(urls), ccipRead: false }))
  const chain = CHAINS[chainId]
  if (!chain) throw new Error(`Chain ${chainId} is not supported.`)
  client = createClient({ chain, transport: fallback(heldTo(urls, chainId)), ccipRead: false })
  // The record never replaces a supplied endpoint.
  if (!load(RPC_KEY)) await adoptRecordEndpoints(chain, urls)
}

/** Prefers the ENS record's endpoints over the initial ones; any failure keeps the current client. */
async function adoptRecordEndpoints(chain: Chain, urls: readonly string[]): Promise<void> {
  try {
    const node = namehash(ENS_NAME)
    const resolver = await readResolver(node)
    const named = endpointsFrom(
      await readContract(client, { address: resolver, abi: ENS_PUBLIC_RESOLVER_ABI, functionName: 'text', args: [node, RPC_ENDPOINTS_TEXT_KEY] }),
    )
    if (!named.length) return
    // A record endpoint that cannot be reached is passed over until the Page reloads.
    const transport = fallback([...named.map((url) => checked(url, chainId, false)), ...heldTo(urls, chainId)])
    const next = createClient({ chain, transport, ccipRead: false })
    if ((await getChainId(next)) === chainId) client = next
  } catch {
    /* keep the current client */
  }
}

/** The batch calls the resolver, so only the one the page was built for is trusted. */
async function readResolver(node: Hex): Promise<Address> {
  const resolver = await readContract(client, { address: ENS_REGISTRY_WITH_FALLBACK, abi: ENS_REGISTRY_WITH_FALLBACK_ABI, functionName: 'resolver', args: [node] })
  if (resolver === zeroAddress) throw new NameUnset(`${ENS_NAME} has no resolver set.`)
  if (resolver.toLowerCase() !== ENS_PUBLIC_RESOLVER.toLowerCase()) {
    throw new ResolverMismatch(`${ENS_NAME} answers through an unexpected resolver.`)
  }
  return resolver
}

export interface SafeState {
  safe: Address
  owners: readonly Address[]
  threshold: bigint
  nonce: bigint
  resolver: Address
}

/**
 * The Safe is read at the address this Page was built with, so a yes stays
 * shown whatever later happens to the name. Only a 1-of-1 Safe also needs the
 * name to answer, through the pinned resolver, with that Safe.
 */
export async function readSafeState(): Promise<SafeState> {
  if (((await getCode(client, { address: SAFE })) ?? '0x') === '0x') throw new NameUnset('The Safe has no code.')
  const [owners, threshold, nonce] = await Promise.all([
    readContract(client, { address: SAFE, abi: SAFE_ABI, functionName: 'getOwners' }),
    readContract(client, { address: SAFE, abi: SAFE_ABI, functionName: 'getThreshold' }),
    readContract(client, { address: SAFE, abi: SAFE_ABI, functionName: 'nonce' }),
  ])
  if (threshold !== 1n) return { safe: SAFE, owners, threshold, nonce, resolver: ENS_PUBLIC_RESOLVER }

  const node = namehash(ENS_NAME)
  const resolver = await readResolver(node)
  const safe = await readContract(client, { address: resolver, abi: ENS_PUBLIC_RESOLVER_ABI, functionName: 'addr', args: [node] })
  if (safe === zeroAddress) throw new NameUnset(`${ENS_NAME} does not resolve to an address.`)
  if (safe.toLowerCase() !== SAFE.toLowerCase()) throw new ResolverMismatch(`${ENS_NAME} resolves to another address.`)
  return { safe: SAFE, owners, threshold, nonce, resolver }
}

/** The SafeTx the Safe hashes; signing, display and execution must all use this. */
export function safeTxFor(handoff: Handoff, resolver: Address) {
  return batchSafeTx(
    { name: ENS_NAME, label: ENS_LABEL, safe: handoff.safe, registry: ENS_REGISTRY_WITH_FALLBACK, resolver, newOwner: handoff.newOwner, threshold: SAFE_THRESHOLD },
    SAFE_MULTI_SEND_CALL_ONLY,
    BigInt(handoff.nonce),
  )
}

export function safeTxTypedData(handoff: Handoff, resolver: Address) {
  return {
    domain: safeTxDomain(chainId, handoff.safe),
    types: SAFE_TX_TYPES,
    primaryType: 'SafeTx' as const,
    message: safeTxFor(handoff, resolver),
  }
}

export const hashOf = (handoff: Handoff, resolver: Address): Hex => hashTypedData(safeTxTypedData(handoff, resolver))

export const includesAddress = (list: readonly Address[], a: Address): boolean =>
  list.some((o) => o.toLowerCase() === a.toLowerCase())

/**
 * The handoff's hash if a current owner signed it for this Safe at its current
 * nonce, else null. The signer is recovered, never read from the link, so a
 * tampered field fails; an address with a broken checksum cannot be hashed and
 * fails alike.
 */
export async function signedByOwner(handoff: Handoff, s: SafeState): Promise<Hex | null> {
  if (!handoff.sig || handoff.safe.toLowerCase() !== s.safe.toLowerCase() || BigInt(handoff.nonce) !== s.nonce) return null
  try {
    const hash = hashOf(handoff, s.resolver)
    return includesAddress(s.owners, await recoverAddress({ hash, signature: handoff.sig })) ? hash : null
  } catch {
    return null
  }
}
