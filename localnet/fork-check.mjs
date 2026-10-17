/**
 * Checks the page's mainnet assumptions against a fork: the name resolves, the
 * contracts it calls match the local chain's code, the Safe is configured as
 * expected and, before the batch has run, the page's batch executes on it. The
 * fork is reverted afterwards. Needs the network, so it is not part of the suite.
 *
 *   anvil --fork-url <endpoint> --fork-block-number <block> --port 8548 &
 *   ANVIL_RPC=http://127.0.0.1:8548 node localnet/fork-check.mjs
 */
import { concat, createPublicClient, createWalletClient, erc721Abi, http, labelhash, namehash, pad, parseEther, toHex, zeroAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { batchSafeTx } from '../src/altar/lib/batch.ts'
import { ENS_REGISTRY_WITH_FALLBACK_ABI, ENS_PUBLIC_RESOLVER_ABI, SAFE_ABI } from '../src/altar/lib/abi.ts'
import { RPC_ENDPOINTS_TEXT_KEY, endpointsFrom } from '../src/altar/lib/registry.ts'
import { DEV_KEYS } from './keys.mjs'
import {
  CONFIG, ENS_FIRST_LABEL, ENS_LEGACY_REGISTRY, ENS_REGISTRY_WITH_FALLBACK, ENS_REGISTRY_WITH_FALLBACK_FULL_ABI, ENS_PUBLIC_RESOLVER, MAINNET_CODE,
  SAFE_FALLBACK_HANDLER, SAFE_FALLBACK_HANDLER_SLOT, SAFE_FULL_ABI, SAFE_MULTI_SEND_CALL_ONLY, SAFE_SINGLETON, addressAt, artifact,
} from './stage.mjs'
import { check, reachable, report } from './check.mjs'

const RPC = process.env.ANVIL_RPC ?? 'http://127.0.0.1:8548'
const client = createPublicClient({ chain: mainnet, transport: http(RPC) })

// keccak256("guard_manager.guard.address")
const SAFE_GUARD_SLOT = '0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8'
const SAFE_SENTINEL = '0x0000000000000000000000000000000000000001'
// The .eth registrar, an ERC-721: its token holder, the registrant, can reclaim the name in the registry.
const ENS_ETH_REGISTRAR = '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85'
const slot = (address, at) => addressAt(client, address, at)

async function main() {
  const id = await client.getChainId()
  check('the fork answers as chain 1', id === 1, String(id))

  const node = namehash(CONFIG.name)
  const resolver = await client.readContract({ address: ENS_REGISTRY_WITH_FALLBACK, abi: ENS_REGISTRY_WITH_FALLBACK_ABI, functionName: 'resolver', args: [node] })
  check('the name uses the resolver the local chain carries', resolver === ENS_PUBLIC_RESOLVER, resolver)
  check('the registry falls back to the registry the local chain carries',
    (await slot(ENS_REGISTRY_WITH_FALLBACK, '0x2')) === ENS_LEGACY_REGISTRY.toLowerCase())

  const safe = await client.readContract({ address: resolver, abi: ENS_PUBLIC_RESOLVER_ABI, functionName: 'addr', args: [node] })
  check('the name resolves to the Safe the page carries', safe.toLowerCase() === CONFIG.safe.toLowerCase(), safe)
  const record = await client.readContract({ address: resolver, abi: ENS_PUBLIC_RESOLVER_ABI, functionName: 'text', args: [node, RPC_ENDPOINTS_TEXT_KEY] })
  check(`the resolver answers the ${RPC_ENDPOINTS_TEXT_KEY} record`, typeof record === 'string', record || '(empty)')
  check('and every endpoint it holds is one the page would use', endpointsFrom(record).length === record.split(',').filter((s) => s.trim()).length, record)

  // The local chain places this code at these addresses; it must match mainnet.
  for (const [name, address] of MAINNET_CODE) {
    const code = await client.getCode({ address })
    check(`${name} at ${address} is byte-identical to the local chain's`, code === artifact(name).deployedBytecode)
  }

  const [version, threshold, owners, nonce] = await Promise.all([
    client.readContract({ address: safe, abi: SAFE_FULL_ABI, functionName: 'VERSION' }),
    client.readContract({ address: safe, abi: SAFE_ABI, functionName: 'getThreshold' }),
    client.readContract({ address: safe, abi: SAFE_ABI, functionName: 'getOwners' }),
    client.readContract({ address: safe, abi: SAFE_ABI, functionName: 'nonce' }),
  ])
  check('the name resolves to a Safe 1.4.1', version === '1.4.1', version)
  check('the Safe runs the canonical 1.4.1 singleton', (await slot(safe, '0x0')) === SAFE_SINGLETON.toLowerCase())
  check('the Safe uses the canonical fallback handler', (await slot(safe, SAFE_FALLBACK_HANDLER_SLOT)) === SAFE_FALLBACK_HANDLER.toLowerCase())
  check('the Safe has no guard', (await slot(safe, SAFE_GUARD_SLOT)) === zeroAddress)
  const [modules] = await client.readContract({ address: safe, abi: SAFE_FULL_ABI, functionName: 'getModulesPaginated', args: [SAFE_SENTINEL, 10n] })
  check('the Safe has no modules', modules.length === 0, modules.join(', '))
  check('its threshold is the one the page expects to see', threshold === 1n || threshold === 2n, String(threshold))
  check('it has owners', owners.length > 0, owners.join(', '))

  // The starting state localnet/stage.mjs reproduces.
  const sub = (n) => namehash(`${n}.${CONFIG.name}`)
  const ownerOf = (which) => client.readContract({ address: ENS_REGISTRY_WITH_FALLBACK, abi: ENS_REGISTRY_WITH_FALLBACK_FULL_ABI, functionName: 'owner', args: [which] })
  const addrOf = async (which) => {
    const r = await client.readContract({ address: ENS_REGISTRY_WITH_FALLBACK, abi: ENS_REGISTRY_WITH_FALLBACK_ABI, functionName: 'resolver', args: [which] })
    return r === zeroAddress ? zeroAddress : client.readContract({ address: r, abi: ENS_PUBLIC_RESOLVER_ABI, functionName: 'addr', args: [which] })
  }
  const parentOwner = await ownerOf(node)
  check('the name itself is owned by the Safe it resolves to', parentOwner.toLowerCase() === safe.toLowerCase(), parentOwner)
  const token = BigInt(labelhash(CONFIG.name.replace(/\.eth$/, '')))
  const registrant = await client.readContract({ address: ENS_ETH_REGISTRAR, abi: erc721Abi, functionName: 'ownerOf', args: [token] })
  check('its registrant, who could reclaim it, is the Safe', registrant.toLowerCase() === safe.toLowerCase(), registrant)
  const approved = await client.readContract({ address: ENS_ETH_REGISTRAR, abi: erc721Abi, functionName: 'getApproved', args: [token] })
  check('and nobody is approved to move its registration', approved === zeroAddress, approved)

  for (const n of [ENS_FIRST_LABEL, CONFIG.label]) {
    const r = await client.readContract({ address: ENS_REGISTRY_WITH_FALLBACK, abi: ENS_REGISTRY_WITH_FALLBACK_ABI, functionName: 'resolver', args: [sub(n)] })
    check(`${n}.${CONFIG.name} uses the same resolver`, r === ENS_PUBLIC_RESOLVER, r)
  }

  const lower = (a) => a.toLowerCase()
  // The Pages' names: whoever owns one could repoint it alone.
  for (const n of ['altar', 'sigil']) {
    const holder = await ownerOf(sub(n))
    if (holder !== zeroAddress) check(`${n}.${CONFIG.name} is owned by the Safe`, lower(holder) === lower(safe), holder)
  }

  const firstOwner = await ownerOf(sub(ENS_FIRST_LABEL))
  const secondOwner = await ownerOf(sub(CONFIG.label))
  check('the first sub-name points at its holder', lower(await addrOf(sub(ENS_FIRST_LABEL))) === lower(firstOwner))
  if (threshold === 1n) {
    check('both sub-names are held by the same key, not by the Safe',
      firstOwner !== zeroAddress && lower(firstOwner) === lower(secondOwner) && lower(firstOwner) !== lower(safe),
      `${firstOwner} / ${secondOwner}`)
    check('the second sub-name points at nobody', (await addrOf(sub(CONFIG.label))) === zeroAddress)
  } else {
    // After the batch: the added owner holds the second sub-name, and it points at them.
    check('the second sub-name is held by an owner of the Safe', owners.some((o) => lower(o) === lower(secondOwner)), secondOwner)
    check('the second sub-name points at its holder', lower(await addrOf(sub(CONFIG.label))) === lower(secondOwner))
  }

  if (threshold === 1n) {
    console.log('\nThe batch, run on the fork and reverted')
    await runBatch({ safe, resolver, owner: owners[0], nonce, sub, ownerOf, addrOf })
  }

  console.log(`\n  ${CONFIG.name} -> ${safe}  (Safe ${version}, ${threshold}-of-${owners.length}, nonce ${nonce})`)
  report()
}

/**
 * Executes the page's batch as the current owner, impersonated on the fork. A
 * pre-validated signature (v = 1) stands in for the off-chain one, which the
 * local harnesses cover.
 */
async function runBatch({ safe, resolver, owner, nonce, sub, ownerOf, addrOf }) {
  const newOwner = privateKeyToAccount(DEV_KEYS.B).address
  const snapshot = await client.request({ method: 'evm_snapshot', params: [] })
  try {
    await client.request({ method: 'anvil_impersonateAccount', params: [owner] })
    await client.request({ method: 'anvil_setBalance', params: [owner, toHex(parseEther('1'))] })
    const m = batchSafeTx({ name: CONFIG.name, label: CONFIG.label, safe, registry: ENS_REGISTRY_WITH_FALLBACK, resolver, newOwner, threshold: 2 }, SAFE_MULTI_SEND_CALL_ONLY, nonce)
    const signature = concat([pad(owner), pad('0x0'), '0x01'])
    const wallet = createWalletClient({ chain: mainnet, transport: http(RPC), account: owner })
    const hash = await wallet.writeContract({
      address: safe,
      abi: SAFE_ABI,
      functionName: 'execTransaction',
      args: [m.to, m.value, m.data, m.operation, m.safeTxGas, m.baseGas, m.gasPrice, m.gasToken, m.refundReceiver, signature],
    })
    const receipt = await client.waitForTransactionReceipt({ hash })
    check('the batch executes', receipt.status === 'success', receipt.status)
    const [threshold, owners] = await Promise.all([
      client.readContract({ address: safe, abi: SAFE_ABI, functionName: 'getThreshold' }),
      client.readContract({ address: safe, abi: SAFE_ABI, functionName: 'getOwners' }),
    ])
    check('the Safe is then 2-of-2', threshold === 2n && owners.length === 2, `${threshold}-of-${owners.length}`)
    check('the new owner is an owner', owners.includes(newOwner))
    check('the new owner holds the second sub-name', (await ownerOf(sub(CONFIG.label))) === newOwner)
    check('the second sub-name points at the new owner', (await addrOf(sub(CONFIG.label))) === newOwner)
  } finally {
    await client.request({ method: 'anvil_stopImpersonatingAccount', params: [owner] })
    await client.request({ method: 'evm_revert', params: [snapshot] })
  }
}

main().catch(async (e) => {
  console.error(`\nfork check failed: ${e.shortMessage || e.message}`)
  if (!(await reachable(RPC))) {
    console.error('  start the fork first: anvil --fork-url <endpoint> --fork-block-number <block> --port 8548')
  }
  process.exit(1)
})
