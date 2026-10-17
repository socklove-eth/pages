import { describe, it, expect } from 'vitest'
import { keccak256, toHex } from 'viem'
import { SAFE_TX_TYPES, safeTxDomain } from './safeTx.ts'

// Safe 1.4.1's SAFE_TX_TYPEHASH and DOMAIN_SEPARATOR_TYPEHASH, from Safe.sol.
const SAFE_TX_TYPEHASH = '0xbb8310d486368db6bd6f849402fdd73ad53d316b5a4b2644ad6efe0f941286d8'
const DOMAIN_TYPEHASH = '0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218'

const encodeType = (name: string, fields: readonly { name: string; type: string }[]) =>
  `${name}(${fields.map((f) => `${f.type} ${f.name}`).join(',')})`

describe('safeTx', () => {
  it('encodes SafeTx to the typehash Safe.sol pins', () => {
    expect(keccak256(toHex(encodeType('SafeTx', SAFE_TX_TYPES.SafeTx)))).toBe(SAFE_TX_TYPEHASH)
  })

  it('uses a domain of chainId and verifyingContract only', () => {
    const domain = safeTxDomain(1, '0x0857293192bF97Ee73bB471c185E1933Fa51E0ca')
    expect(Object.keys(domain)).toEqual(['chainId', 'verifyingContract'])
    const fields = [
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ]
    expect(keccak256(toHex(encodeType('EIP712Domain', fields)))).toBe(DOMAIN_TYPEHASH)
  })
})
