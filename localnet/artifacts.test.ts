/** Every vendored file is pinned to the bytes it was delivered as. */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Resolve from the vitest root: import.meta.url is an http:// URL under jsdom.
const DIR = resolve(process.cwd(), 'localnet/artifacts')

const SHA256: Record<string, string> = {
  'ens/ENSRegistry.code': '9d217ce57e3a36d5769e7a39a74f3c2b6b8bf6cffeaed666ada77bad9992a453',
  'ens/ENSRegistryWithFallback.code': '27603a9d86934185e512a3a86b0299e9eb0ea423f37daf786a899fd87fd49883',
  'ens/PublicResolver.code': '47fd1508471d190fc1dfd3a9eb74e53ffd46528af43cfe4280159cbba6b562fd',
  'ens/deployments/mainnet/ENSRegistry.json': '0b5a548f9d9573ff5dfe5876d21533ed5c3026e9a3ce9c6d9a4dae009ab66b39',
  'ens/deployments/mainnet/PublicResolver.json': 'cb92d2c3bea6918a7887770806afded768479c4ca98b9809e33d83f9b99f07e2',
  'safe/COPYING': 'fb981668c18a279e285fc4d83fba1e836cc84dd4daa73c9697d3cfd2d8aca6e0',
  'safe/COPYING.LESSER': 'da7eabb7bafdf7d3ae5e9f223aa5bdc1eece45ac569dc21b3b037520b4464768',
  'safe/CompatibilityFallbackHandler.json': 'cd4f07b0984afb35dc9699e911eff240b11599fd78e4be12be64b401e5fd57bb',
  'safe/MultiSendCallOnly.json': '1cdf585a317b17e50e15c2cde9a41fa5a16b1579076a8a209005924b3cc2a8f2',
  'safe/Safe.json': 'c36a5e99bc3f25c2d75ac5f7920b679200b3ce617c0d26e674b1321dbc6b0bdf',
  'safe/SafeProxyFactory.json': 'f77ccb60e95345e6583216e82feb5430098679d62aa4aeda7388df3831476997',
}

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]))

describe('the vendored artifacts', () => {
  it.each(Object.entries(SHA256))('%s holds the bytes it was delivered as', (path, digest) => {
    expect(createHash('sha256').update(readFileSync(join(DIR, path))).digest('hex')).toBe(digest)
  })

  it('are every file there is', () => {
    expect(files(DIR).map((f) => relative(DIR, f)).sort()).toEqual(Object.keys(SHA256).sort())
  })
})
