import { describe, it, expect, vi } from 'vitest'
import { ContractFunctionExecutionError, HttpRequestError, TimeoutError, UserRejectedRequestError, getAddress, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { DEV_KEYS } from '../../../localnet/keys.mjs'
import { WrongChain } from './registry.ts'

// chain.ts reads what the build inlines.
vi.hoisted(() => {
  Object.assign(globalThis, {
    __CONFIG__: {
      name: 'socklove.eth',
      label: 'sockthief',
      registry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
      resolver: '0xF29100983E058B709F3D539b0c765937B804AC15',
      multiSend: '0x9641d764fc13c8B624c04430C7356C1C7C8102e2',
      safe: '0x0857293192bF97Ee73bB471c185E1933Fa51E0ca',
    },
    __RPC_URLS__: [],
  })
})

const { hashOf, includesAddress, safeTxFor, signedByOwner, unreached } = await import('./chain.ts')

const A = privateKeyToAccount(DEV_KEYS.A)
const B = privateKeyToAccount(DEV_KEYS.B)
const stranger = privateKeyToAccount(DEV_KEYS.stranger)
const SAFE: Address = '0x0857293192bF97Ee73bB471c185E1933Fa51E0ca'
const RESOLVER: Address = '0xF29100983E058B709F3D539b0c765937B804AC15'
const OTHER: Address = '0x0000000000000000000000000000000000000001'

const handoff = { safe: SAFE, newOwner: B.address, nonce: '7' }
const state = { safe: SAFE, owners: [A.address], threshold: 1n, nonce: 7n, resolver: RESOLVER }
const signed = async (signer = A, h = handoff) => ({ ...h, sig: await signer.sign({ hash: hashOf(h, RESOLVER) }) })

describe('unreached', () => {
  const call = (cause: Error) => new ContractFunctionExecutionError(cause as never, { abi: [], functionName: 'nonce' })

  it('is true when no endpoint answered or one timed out, however deeply wrapped', () => {
    expect(unreached(new HttpRequestError({ url: 'https://x' }))).toBe(true)
    expect(unreached(call(new TimeoutError({ body: {}, url: 'https://x' })))).toBe(true)
  })

  it('is true for an endpoint that answers for another chain, bare or wrapped', () => {
    expect(unreached(new WrongChain('another chain'))).toBe(true)
    expect(unreached(call(new WrongChain('another chain')))).toBe(true)
  })

  it('is false for a wallet refusal or a plain error', () => {
    expect(unreached(new UserRejectedRequestError(new Error('no')))).toBe(false)
    expect(unreached(new Error('fetch failed'))).toBe(false)
  })
})

describe('includesAddress', () => {
  it('matches an address in any case', () => {
    expect(includesAddress([A.address], A.address.toLowerCase() as Address)).toBe(true)
    expect(includesAddress([A.address.toLowerCase() as Address], A.address)).toBe(true)
  })

  it('finds nothing in an empty list or a list without it', () => {
    expect(includesAddress([], A.address)).toBe(false)
    expect(includesAddress([B.address], A.address)).toBe(false)
  })
})

describe('safeTxFor', () => {
  it('targets the configured MultiSendCallOnly at the handoff nonce, as a bigint', () => {
    const tx = safeTxFor(handoff, RESOLVER)
    expect(getAddress(tx.to)).toBe('0x9641d764fc13c8B624c04430C7356C1C7C8102e2')
    expect(tx.nonce).toBe(7n)
  })

  it('carries the resolver into the batch', () => {
    expect(safeTxFor(handoff, RESOLVER).data).not.toBe(safeTxFor(handoff, OTHER).data)
  })
})

describe('hashOf', () => {
  it('is the same for the same handoff, signed or not', async () => {
    expect(hashOf(handoff, RESOLVER)).toBe(hashOf(await signed(), RESOLVER))
  })

  it('changes with every field and with the resolver', () => {
    const hash = hashOf(handoff, RESOLVER)
    expect(hashOf({ ...handoff, safe: OTHER }, RESOLVER)).not.toBe(hash)
    expect(hashOf({ ...handoff, newOwner: stranger.address }, RESOLVER)).not.toBe(hash)
    expect(hashOf({ ...handoff, nonce: '8' }, RESOLVER)).not.toBe(hash)
    expect(hashOf(handoff, OTHER)).not.toBe(hash)
  })

})

describe('signedByOwner', () => {
  it("returns the hash for a current owner's signature", async () => {
    expect(await signedByOwner(await signed(), state)).toBe(hashOf(handoff, RESOLVER))
  })

  it('refuses a signature from anyone else', async () => {
    expect(await signedByOwner(await signed(stranger), state)).toBeNull()
    expect(await signedByOwner(await signed(B), state)).toBeNull()
  })

  it('refuses a tampered field, another Safe and another nonce', async () => {
    const link = await signed()
    expect(await signedByOwner({ ...link, newOwner: stranger.address }, state)).toBeNull()
    expect(await signedByOwner(link, { ...state, safe: OTHER })).toBeNull()
    expect(await signedByOwner(link, { ...state, nonce: 8n })).toBeNull()
  })

  it('refuses a missing or unreadable signature', async () => {
    expect(await signedByOwner(handoff, state)).toBeNull()
    expect(await signedByOwner({ ...handoff, sig: '0x1234' }, state)).toBeNull()
  })
})
