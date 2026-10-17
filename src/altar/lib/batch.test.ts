import { describe, it, expect } from 'vitest'
import { decodeFunctionData, keccak256, namehash, toHex, type Hex } from 'viem'
import { batchCalls, batchSafeTx, encodeMultiSend } from './batch.ts'
import { ENS_REGISTRY_WITH_FALLBACK_ABI, SAFE_MULTI_SEND_CALL_ONLY_ABI, SAFE_OWNER_MANAGER_ABI, ENS_PUBLIC_RESOLVER_ABI } from './abi.ts'

const SAFE: Hex = '0x0857293192bF97Ee73bB471c185E1933Fa51E0ca'
const ENS_REGISTRY_WITH_FALLBACK: Hex = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
const ENS_PUBLIC_RESOLVER: Hex = '0xF29100983E058B709F3D539b0c765937B804AC15'
const NEW_OWNER: Hex = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const SAFE_MULTI_SEND_CALL_ONLY: Hex = '0x9641d764fc13c8B624c04430C7356C1C7C8102e2'
const ENS_NAME = 'socklove.eth'
const ENS_LABEL = 'sockthief'
const P = { name: ENS_NAME, label: ENS_LABEL, safe: SAFE, registry: ENS_REGISTRY_WITH_FALLBACK, resolver: ENS_PUBLIC_RESOLVER, newOwner: NEW_OWNER, threshold: 2 }

/** Decodes MultiSend's packed buffer using the same fixed widths. */
function decodeMultiSend(packed: Hex) {
  const b = packed.slice(2)
  const out: Array<{ operation: number; to: Hex; value: bigint; data: Hex }> = []
  let i = 0
  while (i < b.length) {
    const operation = parseInt(b.slice(i, i + 2), 16); i += 2
    const to: Hex = `0x${b.slice(i, i + 40)}`; i += 40
    const value = BigInt(`0x${b.slice(i, i + 64)}`); i += 64
    const len = Number(BigInt(`0x${b.slice(i, i + 64)}`)); i += 64
    const data: Hex = `0x${b.slice(i, i + len * 2)}`; i += len * 2
    out.push({ operation, to, value, data })
  }
  return out
}

describe('encodeMultiSend', () => {
  it('packs operation, address, value, length and data with no padding', () => {
    const one = encodeMultiSend([{ to: ENS_REGISTRY_WITH_FALLBACK, data: '0xdeadbeef' }])
    // 1 + 20 + 32 + 32 = 85 bytes of header, then 4 of payload.
    expect((one.length - 2) / 2).toBe(89)
    expect(decodeMultiSend(one)).toEqual([
      { operation: 0, to: ENS_REGISTRY_WITH_FALLBACK.toLowerCase(), value: 0n, data: '0xdeadbeef' },
    ])
  })

  it('never emits a delegatecall operation', () => {
    // MultiSendCallOnly reverts on any non-zero operation, so the batch cannot nest a delegatecall.
    for (const c of decodeMultiSend(encodeMultiSend(batchCalls(P)))) {
      expect(c.operation).toBe(0)
    }
  })

  it('encodes an empty batch as 0x', () => {
    expect(encodeMultiSend([])).toBe('0x')
  })
})

describe('batchCalls', () => {
  const calls = batchCalls(P)
  const parent = namehash(ENS_NAME)
  const child = namehash(`${ENS_LABEL}.${ENS_NAME}`)

  it('is exactly four calls, in the order the authorisation requires', () => {
    expect(calls).toHaveLength(4)
    expect(calls.map((c) => c.to.toLowerCase()))
      .toEqual([ENS_REGISTRY_WITH_FALLBACK, ENS_PUBLIC_RESOLVER, ENS_REGISTRY_WITH_FALLBACK, SAFE].map((a) => a.toLowerCase()))
  })

  it('takes the sub-name before writing to it, because the resolver checks ownership', () => {
    const first = decodeFunctionData({ abi: ENS_REGISTRY_WITH_FALLBACK_ABI, data: calls[0]!.data })
    expect(first.functionName).toBe('setSubnodeOwner')
    expect(first.args).toEqual([parent, keccak256(toHex(ENS_LABEL)), SAFE])
  })

  it('points the sub-name at the new owner address', () => {
    const second = decodeFunctionData({ abi: ENS_PUBLIC_RESOLVER_ABI, data: calls[1]!.data })
    expect(second.functionName).toBe('setAddr')
    expect(second.args).toEqual([child, NEW_OWNER])
  })

  it('hands the sub-name over', () => {
    const third = decodeFunctionData({ abi: ENS_REGISTRY_WITH_FALLBACK_ABI, data: calls[2]!.data })
    expect(third.args).toEqual([parent, keccak256(toHex(ENS_LABEL)), NEW_OWNER])
  })

  it('adds the owner last, while the threshold is still one', () => {
    // Adding the owner first would make the remaining three calls need two signatures.
    const fourth = decodeFunctionData({ abi: SAFE_OWNER_MANAGER_ABI, data: calls[3]!.data })
    expect(fourth.functionName).toBe('addOwnerWithThreshold')
    expect(fourth.args).toEqual([NEW_OWNER, 2n])
  })

  it('never touches sockpusher.socklove.eth', () => {
    const otherNode = namehash(`sockpusher.${ENS_NAME}`).slice(2)
    for (const c of calls) expect(c.data.toLowerCase()).not.toContain(otherNode.toLowerCase())
  })
})

describe('batchSafeTx', () => {
  const m = batchSafeTx(P, SAFE_MULTI_SEND_CALL_ONLY, 6n)

  it('is a delegatecall to MultiSendCallOnly and nowhere else', () => {
    expect(m.to).toBe(SAFE_MULTI_SEND_CALL_ONLY)
    expect(m.operation).toBe(1)
  })

  it('keeps value and the five payment fields at zero', () => {
    // With these zeroed, a failed inner call reverts the batch instead of burning the nonce.
    expect(m.value).toBe(0n)
    expect(m.safeTxGas).toBe(0n)
    expect(m.baseGas).toBe(0n)
    expect(m.gasPrice).toBe(0n)
    expect(m.gasToken).toBe('0x0000000000000000000000000000000000000000')
    expect(m.refundReceiver).toBe('0x0000000000000000000000000000000000000000')
  })

  it('carries the four calls inside multiSend', () => {
    const outer = decodeFunctionData({ abi: SAFE_MULTI_SEND_CALL_ONLY_ABI, data: m.data })
    expect(outer.functionName).toBe('multiSend')
    expect(decodeMultiSend(outer.args[0])).toHaveLength(4)
  })

  it('binds the nonce it was built for', () => {
    expect(m.nonce).toBe(6n)
    expect(batchSafeTx(P, SAFE_MULTI_SEND_CALL_ONLY, 7n).nonce).toBe(7n)
  })
})
