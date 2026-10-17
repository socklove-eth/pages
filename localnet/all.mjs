/**
 * Runs every localnet harness on its own Anvil, reset before each one.
 * Needs anvil on PATH and a current build in dist/.
 *
 *   npm run test:harness
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { reachable } from './check.mjs'

const PORT = Number(process.env.ANVIL_PORT ?? 8546)
const RPC = `http://127.0.0.1:${PORT}`
const HARNESSES = ['lan-check.mjs', 'sigil-check.mjs', 'altar-signature.mjs', 'altar-check.mjs']

const here = (f) => fileURLToPath(new URL(f, import.meta.url))

for (const page of ['altar', 'sigil']) {
  if (!existsSync(here(`../dist/${page}/index.html`))) {
    console.error(`dist/${page}/index.html missing — run npm run build first.`)
    process.exit(1)
  }
}

if (await reachable(RPC)) {
  console.error(`Something is already listening on ${RPC}. Stop it, or set ANVIL_PORT.`)
  process.exit(1)
}

const anvil = spawn('anvil', ['--silent', '--port', String(PORT)], { stdio: 'ignore' })
anvil.on('error', (e) => {
  console.error(`could not start anvil: ${e.message}`)
  process.exit(1)
})
const stop = () => { if (!anvil.killed) anvil.kill() }
process.on('exit', stop)
process.on('SIGINT', () => { stop(); process.exit(130) })

for (let i = 0; i < 30 && !(await reachable(RPC)); i++) {
  await new Promise((r) => setTimeout(r, 500))
}
if (!(await reachable(RPC))) {
  console.error(`anvil did not come up on ${RPC}`)
  process.exit(1)
}

const reset = () =>
  fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"jsonrpc":"2.0","id":1,"method":"anvil_reset","params":[]}',
  }).then((r) => r.json())

const run = (file) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [here(file)], {
      stdio: 'inherit',
      env: { ...process.env, ANVIL_RPC: RPC },
    })
    child.on('close', (code) => resolve(code ?? 1))
  })

const failed = []
for (const file of HARNESSES) {
  console.log(`\n──────── ${file} ────────`)
  const { error } = await reset()
  if (error) {
    console.error(`anvil_reset failed: ${error.message}`)
    stop()
    process.exit(1)
  }
  if ((await run(file)) !== 0) failed.push(file)
}

stop()
console.log(
  failed.length
    ? `\n${failed.length} harness(es) failed: ${failed.join(', ')}\n`
    : `\nall ${HARNESSES.length} harnesses passed\n`,
)
process.exit(failed.length ? 1 : 0)
