/** Checks the batch Altar signs off-chain against a real Safe on Anvil. */
import {
  CONFIG, ENS_PUBLIC_RESOLVER, ENS_REGISTRY_WITH_FALLBACK, OWNER_A, OWNER_B, STRANGER,
  SAFE_FALLBACK_HANDLER, SAFE_FALLBACK_HANDLER_SLOT, SAFE_FULL_ABI, SAFE_MULTI_SEND_CALL_ONLY, SAFE_SINGLETON,
  addressAt, execSafeTx, pub, restageSingleOwner, safeNonce, safeTxHash, setupChain, signSafeTx,
} from './stage.mjs'
import { batchSafeTx } from '../src/altar/lib/batch.ts'
import { check, report } from './check.mjs'

const batch = (safe, newOwner, nonce) =>
  batchSafeTx({
    name: CONFIG.name, label: CONFIG.label, safe, registry: ENS_REGISTRY_WITH_FALLBACK, resolver: ENS_PUBLIC_RESOLVER, newOwner, threshold: 2,
  }, SAFE_MULTI_SEND_CALL_ONLY, nonce)

async function refused(account, safe, message, signature) {
  try {
    await execSafeTx(account, safe, message, signature)
    return false
  } catch {
    return true
  }
}

async function main() {
  const { safe: configured } = await setupChain()

  console.log('\nThe local Safe, configured as mainnet\'s is')
  const version = await pub.readContract({ address: configured, abi: SAFE_FULL_ABI, functionName: 'VERSION' })
  check('it reports version 1.4.1', version === '1.4.1', version)
  check('it runs the canonical 1.4.1 singleton', (await addressAt(pub, configured, '0x0')) === SAFE_SINGLETON.toLowerCase())
  check('it uses the canonical fallback handler',
    (await addressAt(pub, configured, SAFE_FALLBACK_HANDLER_SLOT)) === SAFE_FALLBACK_HANDLER.toLowerCase())

  console.log('\nThe batch — 1-of-1, owner A signs off-chain, owner B executes')
  {
    const safe = configured
    const message = batch(safe, OWNER_B.address, await safeNonce(safe))
    const hash = safeTxHash(safe, message)

    // The page's hash must equal the Safe's own, or the hash it shows is wrong.
    const onChain = await pub.readContract({
      address: safe,
      abi: SAFE_FULL_ABI,
      functionName: 'getTransactionHash',
      args: [
        message.to, message.value, message.data, message.operation, message.safeTxGas,
        message.baseGas, message.gasPrice, message.gasToken, message.refundReceiver, message.nonce,
      ],
    })
    check('the page\'s SafeTx hash matches the Safe\'s getTransactionHash', onChain === hash, `${onChain} vs ${hash}`)

    const signature = await signSafeTx(OWNER_A, safe, message)

    // Nothing is on-chain before execution, so there is no approval to reuse.
    const approved = await pub.readContract({
      address: safe, abi: SAFE_FULL_ABI, functionName: 'approvedHashes', args: [OWNER_A.address, hash],
    })
    check('and the chain knows nothing about it', approved === 0n, `approvedHashes = ${approved}`)

    // OWNER_B is not an owner yet, so this relies only on OWNER_A's signature.
    const receipt = await execSafeTx(OWNER_B, safe, message, signature)
    check('a non-owner executed it with only the off-chain signature', receipt.status === 'success')

    const owners = await pub.readContract({ address: safe, abi: SAFE_FULL_ABI, functionName: 'getOwners' })
    const threshold = await pub.readContract({ address: safe, abi: SAFE_FULL_ABI, functionName: 'getThreshold' })
    check('the Safe is now 2-of-2', owners.length === 2 && threshold === 2n, `${owners.length} owners, threshold ${threshold}`)
  }

  console.log('\nRefusals — what the Safe enforces on its own')
  {
    const { safe } = await restageSingleOwner()
    const nonce = await safeNonce(safe)
    const message = batch(safe, OWNER_B.address, nonce)
    const signature = await signSafeTx(OWNER_A, safe, message)

    // The same signature over different parameters recovers to a non-owner.
    const tampered = batch(safe, '0x000000000000000000000000000000000000bEEF', nonce)
    check('a signature reused against altered parameters is rejected',
      await refused(OWNER_B, safe, tampered, signature))

    check('the Safe refuses a stranger\'s signature',
      await refused(OWNER_B, safe, message, await signSafeTx(STRANGER, safe, message)))
  }

  console.log('\nAt threshold 1, one owner can execute alone')
  {
    const { safe } = await restageSingleOwner()
    const message = batch(safe, OWNER_B.address, await safeNonce(safe))
    const signature = await signSafeTx(OWNER_A, safe, message)

    let executedAlone = false
    try {
      executedAlone = (await execSafeTx(OWNER_A, safe, message, signature)).status === 'success'
    } catch {
      executedAlone = false
    }
    check('at threshold 1 the signer can execute alone', executedAlone, executedAlone ? '' : 'the Safe refused a lone owner')
  }

  report()
}

main().catch((e) => {
  console.error('\nharness error:', e.shortMessage || e.message)
  process.exitCode = 1
})
