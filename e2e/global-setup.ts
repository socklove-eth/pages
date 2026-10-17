import { spawn } from 'node:child_process'
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { reachable } from '../localnet/check.mjs'
import { STATE, loadStage, rpcCall } from './chain'

const PORT = 8547
const RPC = `http://127.0.0.1:${PORT}`

/** The tests drive the built pages, so a stale dist/ would test old code. */
function assertFreshBuild() {
  const root = fileURLToPath(new URL('..', import.meta.url))
  // Tests sit beside the code but are not built in.
  const newest = (dir: string): number =>
    readdirSync(dir, { withFileTypes: true }).reduce((latest, entry) => {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) return Math.max(latest, newest(full))
      return entry.name.endsWith('.test.ts') ? latest : Math.max(latest, statSync(full).mtimeMs)
    }, 0)

  let built: number
  try {
    built = statSync(join(root, 'dist/altar/index.html')).mtimeMs
  } catch {
    throw new Error('dist/altar/index.html is missing — run npm run build first.')
  }
  // Every build input, not only src/.
  const inputs = ['build.mjs', 'vite.config.ts', 'light/light.css', 'page.css', 'favicon.png', 'logo.png', '.env', '.env.development', 'package-lock.json']
  const source = Math.max(
    newest(join(root, 'src')),
    newest(join(root, 'fonts')),
    newest(join(root, 'marks')),
    newest(join(root, 'scripts')),
    ...inputs.map((f) => statSync(join(root, f)).mtimeMs),
  )
  if (source > built) {
    throw new Error('dist/ is older than its inputs — run npm run build before the browser tests.')
  }
}

export default async function globalSetup() {
  assertFreshBuild()

  if (await reachable(RPC)) {
    throw new Error(`Something is already listening on ${RPC}. Stop it before running the browser tests.`)
  }

  // Detached so global-teardown can kill the process group.
  const anvil = spawn('anvil', ['--silent', '--port', String(PORT)], { stdio: 'ignore', detached: true })
  anvil.unref()

  for (let i = 0; i < 40 && !(await reachable(RPC)); i++) {
    await new Promise((r) => setTimeout(r, 250))
  }
  if (!(await reachable(RPC))) throw new Error(`anvil did not come up on ${RPC}`)

  const { setupChain, OWNER_A, OWNER_B } = await loadStage(RPC)
  const staged = await setupChain()
  // Specs that need the Safe as staged revert to this.
  const snapshot = await rpcCall('evm_snapshot', [], RPC)

  writeFileSync(
    STATE,
    JSON.stringify(
      {
        pid: anvil.pid,
        rpc: RPC,
        safe: staged.safe,
        ownerA: OWNER_A.address,
        ownerB: OWNER_B.address,
        snapshot,
      },
      null,
      2,
    ),
  )
}
