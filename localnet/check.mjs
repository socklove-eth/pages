/** Shared by every runner: the tally, a console that records what a page logs, and polling. */
import { VirtualConsole } from 'jsdom'

let passed = 0
const failures = []

export function check(name, ok, detail = '') {
  const line = `${name}${detail ? ` — ${detail}` : ''}`
  if (ok) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failures.push(line)
    console.log(`  ✗ ${line}`)
  }
}

export const tally = () => ({ passed, failures })

/** Prints the tally, then every failure again; a failure sets the exit code. */
export function report() {
  console.log(`\n${passed} passed, ${failures.length} failed`)
  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`)
    process.exitCode = 1
  }
}

/** A jsdom console that pushes every message at `levels`, and jsdom's own errors, onto `noise`. */
export function watchedConsole(noise, levels = ['error', 'warn']) {
  const vc = new VirtualConsole()
  for (const level of levels) {
    vc.on(level, (...args) => noise.push({ level, text: args.map(String).join(' ') }))
  }
  vc.on('jsdomError', (e) => noise.push({ level: 'jsdomError', text: e.message }))
  return vc
}

export async function until(predicate, timeoutMs = 30000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true
    await new Promise((r) => setTimeout(r, 150))
  }
  return false
}

/** Whether a JSON-RPC endpoint answers. */
export async function reachable(rpc) {
  try {
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}',
    })
    return res.ok
  } catch {
    return false
  }
}
