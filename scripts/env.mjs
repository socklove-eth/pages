import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getAddress } from 'viem'

/** One key's value from a .env-style file in `dir`, or '' when the file or key is absent. */
function readEnv(dir, file, key) {
  if (!existsSync(join(dir, file))) return ''
  const line = readFileSync(join(dir, file), 'utf8').split('\n').find((l) => l.startsWith(`${key}=`))
  return line?.slice(key.length + 1).trim() ?? ''
}

/**
 * RPC URLs baked into a build: .env's RPC_URLS, replaced in dev by
 * .env.development's when it sets them. Local override files throw: only
 * tracked files may affect the CID.
 */
export function rpcUrls(dir, dev = false) {
  for (const f of ['.env.local', '.env.production.local', '.env.development.local']) {
    if (existsSync(join(dir, f))) {
      throw new Error(`${f} exists and would override .env — a build may only read tracked files`)
    }
  }
  const set = (dev && readEnv(dir, '.env.development', 'RPC_URLS')) || readEnv(dir, '.env', 'RPC_URLS')
  const urls = set
    .split(',')
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//.test(u))
  if (!urls.length) throw new Error('.env has no usable RPC_URLS')
  return urls
}

/** The name, label and contracts a page acts on, from .env; anything malformed throws. */
export function pageConfig(dir) {
  const read = (key) => readEnv(dir, '.env', key)
  const address = (key) => {
    const value = read(key)
    if (!/^0x[0-9a-fA-F]{40}$/.test(value) || getAddress(value) !== value) {
      throw new Error(`.env ${key} must be a checksummed address`)
    }
    return value
  }
  const name = read('ENS_NAME')
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/.test(name)) throw new Error('.env ENS_NAME must be a .eth name')
  const label = read('ENS_LABEL')
  if (!/^[a-z0-9-]+$/.test(label)) throw new Error('.env ENS_LABEL must be a plain label')
  return {
    name,
    label,
    registry: address('ENS_REGISTRY_WITH_FALLBACK'),
    resolver: address('ENS_PUBLIC_RESOLVER'),
    multiSend: address('SAFE_MULTI_SEND_CALL_ONLY'),
    safe: address('SAFE'),
  }
}
