/**
 * Drives the built Altar in jsdom against a staged Anvil with a stub EIP-1193
 * wallet, through every screen and refusal. The chain is staged once and each
 * part builds on the state the one before it left, so the order matters.
 *
 *   anvil --silent &
 *   node localnet/altar-check.mjs
 */
import { setupChain } from './stage.mjs'
import { check, report, tally } from './check.mjs'
import { consoleNoise } from './altar/harness.mjs'
import * as ask from './altar/ask.mjs'
import * as watch from './altar/watch.mjs'
import * as handoff from './altar/handoff.mjs'
import * as refusals from './altar/refusals.mjs'
import * as wallet from './altar/wallet.mjs'
import * as answer from './altar/answer.mjs'
import * as storage from './altar/storage.mjs'
import * as rpc from './altar/rpc.mjs'
import * as registry from './altar/registry.mjs'

const FILES = { ask, watch, handoff, refusals, wallet, answer, storage, rpc, registry }

const ORDER = [
  ask.asking, watch.idleReads, handoff.reload, refusals.refusedLinks, wallet.walletsAtAsk, wallet.announced, handoff.lowV,
  refusals.sharedGateway, wallet.noWalletAtAnswer, wallet.walletsAtAnswer, answer.answered, answer.chainAfter,
  answer.revert, answer.replacedOrDropped, answer.unreadableReceipt, watch.nonceMoves, watch.laggingNode, refusals.undrawable, storage.blockedStorage, ask.typing,
  answer.done, rpc.reaching, registry.registry, rpc.unreachableAtActs,
]

async function main() {
  console.log('\nStaging a 1-of-1 chain…')
  const ctx = await setupChain()

  const perFile = Object.fromEntries(Object.keys(FILES).map((name) => [name, 0]))
  const fileOf = (part) => Object.keys(FILES).find((name) => Object.values(FILES[name]).includes(part))
  for (const part of ORDER) {
    const before = tally().passed + tally().failures.length
    await part(ctx)
    perFile[fileOf(part)] += tally().passed + tally().failures.length - before
  }

  for (const m of consoleNoise.slice(0, 20)) console.log(`  ✗ [${m.level}] ${m.text.slice(0, 200)}`)
  check('the page logged nothing', consoleNoise.length === 0, `${consoleNoise.length} message(s)`)

  console.log(`\n${Object.entries(perFile).map(([name, n]) => `${name} ${n}`).join(', ')}, console 1`)
  report()
}

// Open pages keep polling intervals alive, so exit explicitly.
main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error('\nharness error:', e.shortMessage || e.message)
    process.exit(1)
  })
