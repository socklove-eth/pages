/**
 * Stages a local chain as mainnet looks to the pages: the Safe and ENS
 * contracts at their mainnet addresses with identical runtime code
 * (fork-check.mjs verifies), and the Safe created via the mainnet proxy factory,
 * then placed at the Safe's mainnet address, which the Page reads directly.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  hashTypedData,
  http,
  keccak256,
  labelhash,
  namehash,
  parseEther,
  toHex,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'
import { pageConfig } from '../scripts/env.mjs'
import { SAFE_ABI, SAFE_OWNER_MANAGER_ABI } from '../src/altar/lib/abi.ts'
import { SAFE_TX_TYPES, safeTxDomain } from '../src/altar/lib/safeTx.ts'
import { DEV_KEYS } from './keys.mjs'

export const RPC = process.env.ANVIL_RPC ?? 'http://127.0.0.1:8545'

// Each file in artifacts/ is unmodified: Safe's 1.4.1 build artifacts; for ENS,
// mainnet's runtime code as eth_getCode returns it, and the ABIs of ENS's
// published mainnet deployments, whose ENSRegistry is the fallback registry.
const SAFE_ARTIFACTS = ['Safe', 'SafeProxyFactory', 'MultiSendCallOnly', 'CompatibilityFallbackHandler']
const ENS_DEPLOYMENTS = { ENSRegistryWithFallback: 'ENSRegistry', PublicResolver: 'PublicResolver' }

const read = (path) => readFileSync(fileURLToPath(new URL(`./artifacts/${path}`, import.meta.url)), 'utf8')

export function artifact(name) {
  if (SAFE_ARTIFACTS.includes(name)) {
    const { abi, deployedBytecode } = JSON.parse(read(`safe/${name}.json`))
    return { abi, deployedBytecode }
  }
  const deployment = ENS_DEPLOYMENTS[name]
  return {
    abi: deployment ? JSON.parse(read(`ens/deployments/mainnet/${deployment}.json`)).abi : [],
    deployedBytecode: read(`ens/${name}.code`).trim(),
  }
}

export const SAFE_FULL_ABI = artifact('Safe').abi
export const ENS_REGISTRY_WITH_FALLBACK_FULL_ABI = artifact('ENSRegistryWithFallback').abi
export const ENS_PUBLIC_RESOLVER_FULL_ABI = artifact('PublicResolver').abi

export const SAFE_SINGLETON = '0x41675C099F32341bf84BFc5382aF534df5C7461a'
const SAFE_PROXY_FACTORY = '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67'
export const SAFE_FALLBACK_HANDLER = '0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99'
// keccak256("fallback_manager.handler.address")
export const SAFE_FALLBACK_HANDLER_SLOT = '0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5'
/** The fallback registry's predecessor; unknown names are read from it. */
export const ENS_LEGACY_REGISTRY = '0x314159265dD8dbb310642f98f50C066173C1259b'
/** The page's own .env: the local chain places mainnet's code at these addresses. */
export const CONFIG = pageConfig(fileURLToPath(new URL('..', import.meta.url)))
export const { registry: ENS_REGISTRY_WITH_FALLBACK, resolver: ENS_PUBLIC_RESOLVER, multiSend: SAFE_MULTI_SEND_CALL_ONLY, safe: SAFE } = CONFIG
export const ENS_NODE = namehash(CONFIG.name)
/** The asking owner's sub-name, beside the one the batch hands over. */
export const ENS_FIRST_LABEL = 'sockpusher'
const [ENS_NAME_LABEL, ENS_TLD] = CONFIG.name.split('.')
const ENS_TLD_NODE = namehash(ENS_TLD)

export const MAINNET_CODE = [
  ['Safe', SAFE_SINGLETON],
  ['SafeProxyFactory', SAFE_PROXY_FACTORY],
  ['MultiSendCallOnly', SAFE_MULTI_SEND_CALL_ONLY],
  ['CompatibilityFallbackHandler', SAFE_FALLBACK_HANDLER],
  ['ENSRegistryWithFallback', ENS_REGISTRY_WITH_FALLBACK],
  ['ENSRegistry', ENS_LEGACY_REGISTRY],
  ['PublicResolver', ENS_PUBLIC_RESOLVER],
]

export const OWNER_A = privateKeyToAccount(DEV_KEYS.A)
export const OWNER_B = privateKeyToAccount(DEV_KEYS.B)
export const STRANGER = privateKeyToAccount(DEV_KEYS.stranger)

export const pub = createPublicClient({ chain: foundry, transport: http(RPC) })
export const wallet = (account) => createWalletClient({ account, chain: foundry, transport: http(RPC) })
export const mined = (hash) => pub.waitForTransactionReceipt({ hash })

/** The address a storage slot holds, lowercased. */
export const addressAt = async (client, address, slot) =>
  `0x${((await client.getStorageAt({ address, slot })) ?? '0x').slice(-40)}`.toLowerCase()

// anvil_setCode skips constructors, so their storage writes are made here.
const ENS_ROOT = `0x${'00'.repeat(32)}`
// The registry keeps `records` at slot 0 (a Record's owner is its first word)
// and its predecessor at slot 2.
const ENS_ROOT_OWNER_SLOT = keccak256(`0x${'00'.repeat(64)}`)
const ENS_LEGACY_SLOT = '0x2'
// The singleton's threshold is 1, so setup() can never run on it.
const SAFE_THRESHOLD_SLOT = '0x4'

const word = (value) => toHex(BigInt(value), { size: 32 })
const SAFE_SENTINEL = '0x0000000000000000000000000000000000000001'
const mappingSlot = (key, slot) => keccak256(`${word(key)}${word(slot).slice(2)}`)
const rpc = (method, params) => pub.request({ method, params })

async function assertLocalChain() {
  const id = await pub.getChainId()
  if (id !== foundry.id) throw new Error(`chain ${id} is not the local chain (expected ${foundry.id})`)
}

async function placeMainnetCode() {
  for (const [name, address] of MAINNET_CODE) {
    await rpc('anvil_setCode', [address, artifact(name).deployedBytecode])
  }
  await rpc('anvil_setStorageAt', [SAFE_SINGLETON, SAFE_THRESHOLD_SLOT, word(1)])
  await rpc('anvil_setStorageAt', [ENS_REGISTRY_WITH_FALLBACK, ENS_LEGACY_SLOT, word(ENS_LEGACY_REGISTRY)])
  await rpc('anvil_setStorageAt', [ENS_REGISTRY_WITH_FALLBACK, ENS_ROOT_OWNER_SLOT, word(OWNER_A.address)])
}

/** A SafeTx with no gas refund, as the page builds them. */
const safeTx = (to, data, nonce, operation = 0) => ({
  to, value: 0n, data, operation, safeTxGas: 0n, baseGas: 0n, gasPrice: 0n, gasToken: zeroAddress, refundReceiver: zeroAddress, nonce,
})

export const safeTxHash = (safe, message) =>
  hashTypedData({ domain: safeTxDomain(foundry.id, safe), types: SAFE_TX_TYPES, primaryType: 'SafeTx', message })

export const signSafeTx = (account, safe, message) =>
  account.signTypedData({ domain: safeTxDomain(foundry.id, safe), types: SAFE_TX_TYPES, primaryType: 'SafeTx', message })

export async function execSafeTx(executor, safe, m, signature) {
  return mined(await wallet(executor).writeContract({
    address: safe,
    abi: SAFE_ABI,
    functionName: 'execTransaction',
    args: [m.to, m.value, m.data, m.operation, m.safeTxGas, m.baseGas, m.gasPrice, m.gasToken, m.refundReceiver, signature],
  }))
}

export const safeNonce = (safe) => pub.readContract({ address: safe, abi: SAFE_ABI, functionName: 'nonce' })

/** A 1-of-1 Safe created as on mainnet: proxy factory, fallback handler set. */
async function deploySafe(owner = OWNER_A) {
  const initializer = encodeFunctionData({
    abi: SAFE_FULL_ABI,
    functionName: 'setup',
    args: [[owner.address], 1n, zeroAddress, '0x', SAFE_FALLBACK_HANDLER, zeroAddress, 0n, zeroAddress],
  })
  const salt = BigInt(await pub.getTransactionCount({ address: OWNER_A.address }))
  const { request, result } = await pub.simulateContract({
    account: OWNER_A,
    address: SAFE_PROXY_FACTORY,
    abi: artifact('SafeProxyFactory').abi,
    functionName: 'createProxyWithNonce',
    args: [SAFE_SINGLETON, initializer, salt],
  })
  await mined(await wallet(OWNER_A).writeContract(request))
  await mined(await wallet(OWNER_A).sendTransaction({ to: result, value: parseEther('1') }))
  return result
}

/**
 * A fresh 1-of-1 Safe at the address the Page reads: a factory-made proxy's
 * code and storage copied over, and any earlier owner there cleared.
 */
async function placeSafe(owner = OWNER_A) {
  const fresh = await deploySafe(owner)
  if (((await pub.getCode({ address: SAFE })) ?? '0x') !== '0x') {
    for (const o of await pub.readContract({ address: SAFE, abi: SAFE_ABI, functionName: 'getOwners' })) {
      await rpc('anvil_setStorageAt', [SAFE, mappingSlot(o, 2), word(0)])
    }
  }
  await rpc('anvil_setCode', [SAFE, await pub.getCode({ address: fresh })])
  // Safe.sol's layout: singleton, modules, owners, ownerCount, threshold, nonce.
  const slots = [0, 3, 4, 5].map(word)
    .concat([mappingSlot(SAFE_SENTINEL, 1), mappingSlot(SAFE_SENTINEL, 2), mappingSlot(owner.address, 2), SAFE_FALLBACK_HANDLER_SLOT])
  for (const slot of slots) {
    await rpc('anvil_setStorageAt', [SAFE, slot, (await pub.getStorageAt({ address: fresh, slot })) ?? word(0)])
  }
  await rpc('anvil_setBalance', [SAFE, toHex(parseEther('1'))])
  return SAFE
}

const registryWrite = (functionName, args) =>
  wallet(OWNER_A).writeContract({ address: ENS_REGISTRY_WITH_FALLBACK, abi: ENS_REGISTRY_WITH_FALLBACK_FULL_ABI, functionName, args }).then(mined)
const setAddr = (node, address) =>
  wallet(OWNER_A).writeContract({ address: ENS_PUBLIC_RESOLVER, abi: ENS_PUBLIC_RESOLVER_FULL_ABI, functionName: 'setAddr', args: [node, address] }).then(mined)

/** Points the name at `safe`, stages its sub-names, then hands the name to the Safe. */
async function pointNameAt(safe) {
  await registryWrite('setSubnodeOwner', [ENS_TLD_NODE, labelhash(ENS_NAME_LABEL), OWNER_A.address])
  await registryWrite('setResolver', [ENS_NODE, ENS_PUBLIC_RESOLVER])
  await setAddr(ENS_NODE, safe)
  await stageSubnames()
  // Last: the Safe owns the name, so it can reassign sub-names.
  await registryWrite('setSubnodeOwner', [ENS_TLD_NODE, labelhash(ENS_NAME_LABEL), safe])
}

export async function setupChain() {
  await assertLocalChain()
  await placeMainnetCode()
  await registryWrite('setSubnodeOwner', [ENS_ROOT, labelhash(ENS_TLD), OWNER_A.address])
  await registryWrite('setSubnodeOwner', [ENS_TLD_NODE, labelhash(ENS_NAME_LABEL), OWNER_A.address])
  await registryWrite('setResolver', [ENS_NODE, ENS_PUBLIC_RESOLVER])
  const safe = await placeSafe()
  await pointNameAt(safe)
  return { safe }
}

/** A write sent from the Safe's own address, as the Safe itself could make it. */
export async function asSafe(address, abi, functionName, args) {
  await rpc('anvil_impersonateAccount', [SAFE])
  try {
    await mined(await wallet(SAFE).writeContract({ address, abi, functionName, args }))
  } finally {
    await rpc('anvil_stopImpersonatingAccount', [SAFE])
  }
}

/** Adds OWNER_B at threshold 2 without a browser, for tests that start at 2-of-2. */
export async function addSecondOwner(safe) {
  const data = encodeFunctionData({ abi: SAFE_OWNER_MANAGER_ABI, functionName: 'addOwnerWithThreshold', args: [OWNER_B.address, 2n] })
  const message = safeTx(safe, data, await safeNonce(safe))
  const receipt = await execSafeTx(OWNER_B, safe, message, await signSafeTx(OWNER_A, safe, message))
  if (receipt.status !== 'success') throw new Error(`adding the second owner reverted in ${receipt.transactionHash}`)
}

/** Executes an empty Safe transaction to move the nonce on. */
export async function bumpSafeNonce(safe) {
  const message = safeTx(safe, '0x', await safeNonce(safe))
  await execSafeTx(OWNER_A, safe, message, await signSafeTx(OWNER_A, safe, message))
}

/** Sub-names as on mainnet: both held by OWNER_A, the first -> OWNER_A, the handed-over one -> zero. */
async function stageSubnames() {
  for (const label of [ENS_FIRST_LABEL, CONFIG.label]) {
    await registryWrite('setSubnodeOwner', [ENS_NODE, labelhash(label), OWNER_A.address])
    await registryWrite('setResolver', [namehash(`${label}.${CONFIG.name}`), ENS_PUBLIC_RESOLVER])
  }
  await setAddr(namehash(`${ENS_FIRST_LABEL}.${CONFIG.name}`), OWNER_A.address)
  await setAddr(namehash(`${CONFIG.label}.${CONFIG.name}`), zeroAddress)
}

/** Points the name at a fresh 1-of-1 Safe, since the current one may be 2-of-2. */
export async function restageSingleOwner() {
  const safe = await placeSafe()
  await pointNameAt(safe)
  return { safe }
}
