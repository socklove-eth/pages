// @vitest-environment node
import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pageConfig, rpcUrls } from './env.mjs'

let dir: string
const write = (file: string, text: string) => writeFileSync(join(dir, file), text)

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'env-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('rpcUrls', () => {
  it('reads the comma-separated set from .env, trimmed, in order', () => {
    write('.env', '# comment\nRPC_URLS= https://a.example , https://b.example\n')
    expect(rpcUrls(dir)).toEqual(['https://a.example', 'https://b.example'])
  })

  it('takes the first of a duplicated key', () => {
    write('.env', 'RPC_URLS=https://a.example\nRPC_URLS=https://b.example\n')
    expect(rpcUrls(dir)).toEqual(['https://a.example'])
  })

  it('drops entries that are not http or https', () => {
    write('.env', 'RPC_URLS=ftp://a.example,,wss://b.example,http://c.example\n')
    expect(rpcUrls(dir)).toEqual(['http://c.example'])
  })

  it('throws when .env is absent', () => {
    expect(() => rpcUrls(dir)).toThrow(/no usable RPC_URLS/)
  })

  it('throws when the set is empty or unusable', () => {
    write('.env', 'RPC_URLS=\n')
    expect(() => rpcUrls(dir)).toThrow(/no usable RPC_URLS/)
    write('.env', 'RPC_URLS=ftp://a.example\n')
    expect(() => rpcUrls(dir)).toThrow(/no usable RPC_URLS/)
  })

  it('replaces the set with the development one in development', () => {
    write('.env', 'RPC_URLS=https://a.example\n')
    write('.env.development', 'RPC_URLS=http://127.0.0.1:8545\n')
    expect(rpcUrls(dir, true)).toEqual(['http://127.0.0.1:8545'])
  })

  it('reads the development set in development when .env is absent', () => {
    write('.env.development', 'RPC_URLS=http://127.0.0.1:8545\n')
    expect(rpcUrls(dir, true)).toEqual(['http://127.0.0.1:8545'])
  })

  it('keeps the .env set in development when the development file sets none', () => {
    write('.env', 'RPC_URLS=https://a.example\n')
    expect(rpcUrls(dir, true)).toEqual(['https://a.example'])
  })

  it('ignores the development set in production', () => {
    write('.env', 'RPC_URLS=https://a.example\n')
    write('.env.development', 'RPC_URLS=http://127.0.0.1:8545\n')
    expect(rpcUrls(dir)).toEqual(['https://a.example'])
  })

  it('refuses every local override file', () => {
    for (const file of ['.env.local', '.env.production.local', '.env.development.local']) {
      write('.env', 'RPC_URLS=https://a.example\n')
      write(file, 'RPC_URLS=https://evil.example\n')
      expect(() => rpcUrls(dir), file).toThrow(new RegExp(file.replace(/\./g, '\\.')))
      rmSync(join(dir, file))
    }
  })
})

describe('pageConfig', () => {
  const GOOD = [
    'ENS_NAME=socklove.eth',
    'ENS_LABEL=sockthief',
    'ENS_REGISTRY_WITH_FALLBACK=0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
    'ENS_PUBLIC_RESOLVER=0xF29100983E058B709F3D539b0c765937B804AC15',
    'SAFE_MULTI_SEND_CALL_ONLY=0x9641d764fc13c8B624c04430C7356C1C7C8102e2',
    'SAFE=0x0857293192bF97Ee73bB471c185E1933Fa51E0ca',
  ].join('\n')

  it('reads the name, label and addresses from .env', () => {
    write('.env', GOOD)
    expect(pageConfig(dir)).toEqual({
      name: 'socklove.eth',
      label: 'sockthief',
      registry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
      resolver: '0xF29100983E058B709F3D539b0c765937B804AC15',
      multiSend: '0x9641d764fc13c8B624c04430C7356C1C7C8102e2',
      safe: '0x0857293192bF97Ee73bB471c185E1933Fa51E0ca',
    })
  })

  it.each([
    ['an address that is not checksummed', GOOD.replace('0x9641d764fc13c8B624c04430C7356C1C7C8102e2', '0x9641d764fc13c8b624c04430c7356c1c7c8102e2'), /SAFE_MULTI_SEND_CALL_ONLY/],
    ['a missing address', GOOD.replace(/ENS_PUBLIC_RESOLVER=.*\n/, ''), /ENS_PUBLIC_RESOLVER/],
    ['a name that is not .eth', GOOD.replace('socklove.eth', 'socklove.com'), /ENS_NAME/],
    ['a label with a dot', GOOD.replace('sockthief', 'sock.thief'), /ENS_LABEL/],
  ])('refuses %s', (_, env, message) => {
    write('.env', env)
    expect(() => pageConfig(dir)).toThrow(message)
  })

  it('accepts the committed .env', () => {
    expect(() => pageConfig(process.cwd())).not.toThrow()
  })
})
