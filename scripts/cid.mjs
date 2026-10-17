/**
 * The IPFS CID of a built directory, without an IPFS daemon.
 *
 *   node scripts/cid.mjs [dir ...]
 *
 * IMPORT_OPTIONS is the IPIP-0499 `unixfs-v1-2025` profile, so any kubo with
 * that profile reproduces the CID: `ipfs add -r --only-hash`. scripts/cid.test.ts
 * pins them; any change yields a CID that matches nothing.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, basename } from 'node:path'
import { MemoryBlockstore } from 'blockstore-core/memory'
import { importer } from 'ipfs-unixfs-importer'
import { balanced } from 'ipfs-unixfs-importer/layout'
import { fixedSize } from 'ipfs-unixfs-importer/chunker'

export const IMPORT_OPTIONS = {
  cidVersion: 1,
  rawLeaves: true,
  chunker: fixedSize({ chunkSize: 1048576 }),
  layout: balanced({ maxChildrenPerNode: 1024 }),
  wrapWithDirectory: false,
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

/** CID of `dir` as a directory, the form an ENS contenthash takes. */
export async function directoryCid(dir) {
  const files = walk(dir).sort()
  if (files.length === 0) throw new Error(`${dir} is empty`)

  const root = basename(dir.replace(/\/+$/, ''))
  const source = files.map((file) => ({
    path: `${root}/${relative(dir, file)}`,
    content: readFileSync(file),
  }))

  let last
  for await (const entry of importer(source, new MemoryBlockstore(), IMPORT_OPTIONS)) {
    last = entry
  }
  return { cid: last.cid.toString(), files: files.length }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dirs = process.argv.slice(2)
  if (dirs.length === 0) {
    console.error('usage: node scripts/cid.mjs <dir> [dir ...]')
    process.exit(1)
  }
  for (const dir of dirs) {
    const { cid, files } = await directoryCid(dir)
    console.log(`${cid}  ${dir}  (${files} files)`)
  }
}
