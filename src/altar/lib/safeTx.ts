import type { Address } from 'viem'

/**
 * Matches Safe.sol exactly. The EIP-712 domain has no `name` or `version`;
 * adding either changes the hash and every signature would be rejected.
 */
export const SAFE_TX_TYPES = {
  SafeTx: [
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'data', type: 'bytes' },
    { name: 'operation', type: 'uint8' },
    { name: 'safeTxGas', type: 'uint256' },
    { name: 'baseGas', type: 'uint256' },
    { name: 'gasPrice', type: 'uint256' },
    { name: 'gasToken', type: 'address' },
    { name: 'refundReceiver', type: 'address' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const

export function safeTxDomain(chainId: number, safe: Address) {
  return { chainId, verifyingContract: safe }
}
