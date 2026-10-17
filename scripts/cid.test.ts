// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { MemoryBlockstore } from 'blockstore-core/memory'
import { importer } from 'ipfs-unixfs-importer'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IMPORT_OPTIONS, directoryCid } from './cid.mjs'

/**
 * The CID identifies a release (it goes into the ENS contenthash), so the import
 * parameters are pinned against vectors from kubo 0.43.1 with the
 * `unixfs-v1-2025` profile.
 */
async function cidOf(entries: { path: string; content?: Uint8Array }[]) {
  let last
  for await (const entry of importer(entries, new MemoryBlockstore(), IMPORT_OPTIONS)) last = entry
  if (!last) throw new Error('the importer produced nothing')
  return last.cid.toString()
}

describe('the CID import parameters', () => {
  it('hashes a raw leaf the way ipfs add does', async () => {
    expect(await cidOf([{ path: 'x', content: new TextEncoder().encode('hello world') }])).toBe(
      'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e',
    )
  })

  it('builds a dag-pb directory the way ipfs add does', async () => {
    expect(await cidOf([{ path: 'empty/' }])).toBe(
      'bafybeiczsscdsbs7ffqz55asqdf3smv6klcw3gofszvwlyarci47bgf354',
    )
  })

  // i % 251 for every byte: one chunk at 1 MiB, but two at the legacy 256 KiB.
  const pattern = (length: number) => Uint8Array.from({ length }, (_, i) => i % 251)

  it('keeps a 300 KiB file in one raw block', async () => {
    expect(await cidOf([{ path: 'x', content: pattern(300 * 1024) }])).toBe(
      'bafkreiaquyljqe74ybaqwplsk5h7fxizs6jwxeg3qikcoe3dcwlhz7zlxe',
    )
  })

  it('splits a 1.5 MiB file at 1 MiB', async () => {
    expect(await cidOf([{ path: 'x', content: pattern(1536 * 1024) }])).toBe(
      'bafybeia7t5yio4coa24w2ytmhiu2geux6lya7mkawt4d5zx5prgm6s4vny',
    )
  })

  // kubo 0.43.1, `ipfs init --profile unixfs-v1-2025`, `ipfs add -r -Q --only-hash`.
  it('hashes a directory tree the way ipfs add -r does', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cid-'))
    try {
      mkdirSync(join(dir, 'sub'))
      writeFileSync(join(dir, 'a.txt'), 'SockLove\n')
      writeFileSync(join(dir, 'sub', 'b.txt'), 'two\n')
      expect(await directoryCid(dir)).toEqual({ cid: 'bafybeiak7vuttfdtzfdp4tuiaikrmeuikitdzz56jzinzkiq7eyv3muxea', files: 2 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses an empty directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cid-'))
    try {
      await expect(directoryCid(dir)).rejects.toThrow(/is empty/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
