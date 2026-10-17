/** The hand-written Safe ABIs, held to the vendored Safe 1.4.1 artifacts entry by entry. */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SAFE_ABI, SAFE_MULTI_SEND_CALL_ONLY_ABI, SAFE_OWNER_MANAGER_ABI } from './abi.ts'

type Entry = { readonly type: string; readonly name?: string; readonly stateMutability?: string; readonly inputs?: readonly { readonly type: string }[]; readonly outputs?: readonly { readonly type: string }[] }

// Resolve from the vitest root: import.meta.url is an http:// URL under jsdom.
const vendored = (contract: string): Entry[] =>
  JSON.parse(readFileSync(resolve(process.cwd(), `localnet/artifacts/safe/${contract}.json`), 'utf8')).abi

/** What a call depends on: its name, mutability and argument and return types. */
const shape = (e: Entry) => ({
  name: e.name,
  stateMutability: e.stateMutability,
  inputs: (e.inputs ?? []).map((p) => p.type),
  outputs: (e.outputs ?? []).map((p) => p.type),
})

describe('the hand-written Safe ABIs', () => {
  for (const [label, abi, contract] of [
    ['Safe', SAFE_ABI, 'Safe'],
    ['OwnerManager, part of the Safe', SAFE_OWNER_MANAGER_ABI, 'Safe'],
    ['MultiSendCallOnly', SAFE_MULTI_SEND_CALL_ONLY_ABI, 'MultiSendCallOnly'],
  ] as const) {
    it(`match ${label} as vendored`, () => {
      const source = vendored(contract)
      for (const entry of abi) {
        const match = source.find((e) => e.type === 'function' && e.name === entry.name)
        expect(match, `${entry.name} in ${contract}.json`).toBeDefined()
        expect(shape(entry), entry.name).toEqual(shape(match!))
      }
    })
  }
})
