import { describe, it, expect } from 'vitest'
import { lockedVersions, tooYoung } from './age.mjs'

const DAY = 86_400_000
const NOW = Date.parse('2030-01-10T00:00:00Z')

describe('lockedVersions', () => {
  it('reads every name and version once, scoped and nested included, root excluded', () => {
    const lock = {
      packages: {
        '': { version: '1.0.0' },
        'node_modules/viem': { version: '2.0.0' },
        'node_modules/@scope/pkg': { version: '1.2.3' },
        'node_modules/a/node_modules/viem': { version: '2.0.0' },
      },
    }
    expect(lockedVersions(lock)).toEqual([
      { name: 'viem', version: '2.0.0' },
      { name: '@scope/pkg', version: '1.2.3' },
    ])
  })

  it('reads nothing from a lock with no packages', () => {
    expect(lockedVersions({})).toEqual([])
  })

  it('skips a linked local package and an entry with no version', () => {
    const lock = {
      packages: {
        'node_modules/local': { resolved: '../local', link: true },
        'node_modules/bare': {},
        'node_modules/viem': { version: '2.0.0' },
      },
    }
    expect(lockedVersions(lock)).toEqual([{ name: 'viem', version: '2.0.0' }])
  })
})

describe('tooYoung', () => {
  const versions = [
    { name: 'old', version: '1.0.0' },
    { name: 'new', version: '1.0.0' },
    { name: 'unknown', version: '1.0.0' },
  ]
  const published = {
    old: { '1.0.0': new Date(NOW - 8 * DAY).toISOString() },
    new: { '1.0.0': new Date(NOW - 2 * DAY).toISOString() },
  }

  it('keeps what is older than the cooldown, flags what is not', () => {
    expect(tooYoung(versions, published, NOW, 7).map((v) => v.name)).toEqual(['new', 'unknown'])
  })

  it('flags nothing when every version has aged', () => {
    expect(tooYoung(versions.slice(0, 1), published, NOW, 7)).toEqual([])
  })

  it('passes a version published exactly at the cutoff', () => {
    const atCutoff = { edge: { '1.0.0': new Date(NOW - 7 * DAY).toISOString() } }
    expect(tooYoung([{ name: 'edge', version: '1.0.0' }], atCutoff, NOW, 7)).toEqual([])
  })
})
