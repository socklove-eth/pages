/**
 * Stages a 1-of-1 chain and leaves it running, for testing the built Altar
 * with a real wallet.
 *
 *   anvil --silent &
 *   node localnet/altar-stage.mjs
 *   npm run preview
 */
import { DEV_KEYS } from './keys.mjs'
import { CONFIG, RPC, OWNER_A, OWNER_B, SAFE_FULL_ABI, pub, setupChain } from './stage.mjs'

const KEYS = [
  ['owner A', OWNER_A.address, DEV_KEYS.A],
  ['owner B', OWNER_B.address, DEV_KEYS.B],
]

const line = (k, v) => console.log(`  ${k.padEnd(14)}${v}`)

async function main() {
  console.log('\nStaging a 1-of-1 chain…\n')
  const stage = await setupChain()
  const read = (functionName) => pub.readContract({ address: stage.safe, abi: SAFE_FULL_ABI, functionName })

  console.log('Chain')
  line('RPC', RPC)
  line(CONFIG.name, stage.safe)
  line('threshold', `${await read('getThreshold')} of ${(await read('getOwners')).length}`)

  console.log('\nKeys to import into a wallet, on chain 31337')
  for (const [name, address, key] of KEYS) {
    line(name, address)
    line('', key)
  }

  console.log('\nThen')
  console.log('  1. npm run preview')
  console.log('  2. Open http://localhost:4174/local/ and click through from that tab.')
  console.log('  3. Ask as owner A, then scan the QR code as owner B.')
  console.log('  4. The page settles on "She said yes. The 💍 Ring is whole.".\n')
}

main().catch((e) => {
  console.error('\nstage failed:', e.shortMessage || e.message)
  process.exitCode = 1
})
