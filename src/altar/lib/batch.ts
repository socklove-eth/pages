import { encodeFunctionData, encodePacked, labelhash, namehash, zeroAddress, type Hex } from 'viem'
import { ENS_REGISTRY_WITH_FALLBACK_ABI, SAFE_MULTI_SEND_CALL_ONLY_ABI, SAFE_OWNER_MANAGER_ABI, ENS_PUBLIC_RESOLVER_ABI } from './abi.ts'

// Builds the one Safe batch that adds the second owner and hands them the sub-name.

interface Call {
  to: Hex
  data: Hex
}

/** Per call: 1 byte operation, 20 address, 32 value, 32 length, calldata. */
export function encodeMultiSend(calls: readonly Call[]): Hex {
  return `0x${calls
    .map((c) => encodePacked(
      ['uint8', 'address', 'uint256', 'uint256', 'bytes'],
      [0, c.to, 0n, BigInt((c.data.length - 2) / 2), c.data],
    ).slice(2))
    .join('')}`
}

interface BatchParams {
  /** The parent name and the label of the sub-name handed over. */
  name: string
  label: string
  safe: Hex
  registry: Hex
  resolver: Hex
  newOwner: Hex
  threshold: number
}

export function batchCalls(p: BatchParams): Call[] {
  const parent = namehash(p.name)
  const child = namehash(`${p.label}.${p.name}`)
  const assign = (owner: Hex) =>
    encodeFunctionData({
      abi: ENS_REGISTRY_WITH_FALLBACK_ABI,
      functionName: 'setSubnodeOwner',
      args: [parent, labelhash(p.label), owner],
    })

  return [
    // The Safe owns the sub-name first, so the resolver accepts its setAddr.
    { to: p.registry, data: assign(p.safe) },
    {
      to: p.resolver,
      data: encodeFunctionData({
        abi: ENS_PUBLIC_RESOLVER_ABI,
        functionName: 'setAddr',
        args: [child, p.newOwner],
      }),
    },
    { to: p.registry, data: assign(p.newOwner) },
    // Must be last, while the threshold is still 1.
    {
      to: p.safe,
      data: encodeFunctionData({
        abi: SAFE_OWNER_MANAGER_ABI,
        functionName: 'addOwnerWithThreshold',
        args: [p.newOwner, BigInt(p.threshold)],
      }),
    },
  ]
}

/**
 * `operation: 1` is DELEGATECALL into MultiSendCallOnly. Zero gas/refund fields
 * make a failed inner call revert instead of consuming the nonce.
 */
export function batchSafeTx(p: BatchParams, multiSend: Hex, nonce: bigint) {
  return {
    to: multiSend,
    value: 0n,
    data: encodeFunctionData({
      abi: SAFE_MULTI_SEND_CALL_ONLY_ABI,
      functionName: 'multiSend',
      args: [encodeMultiSend(batchCalls(p))],
    }),
    operation: 1,
    safeTxGas: 0n,
    baseGas: 0n,
    gasPrice: 0n,
    gasToken: zeroAddress,
    refundReceiver: zeroAddress,
    nonce,
  } as const
}
