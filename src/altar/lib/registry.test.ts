import { describe, it, expect, vi } from 'vitest'
import { BaseError, HttpRequestError, TimeoutError, createClient, custom, fallback, http } from 'viem'
import { getBlockNumber } from 'viem/actions'
import { mainnet } from 'viem/chains'
import { endpointsFrom, fetchWhole, isLocalHost, isLoopback, onChain } from './registry.ts'

describe('isLoopback', () => {
  it('lets plain http through to this machine only', () => {
    expect(isLoopback(new URL('http://127.0.0.1:8545'))).toBe(true)
    expect(isLoopback(new URL('http://localhost:8545/'))).toBe(true)
    expect(isLoopback(new URL('http://192.168.1.2:8545'))).toBe(false)
    expect(isLoopback(new URL('http://127.0.0.1.example.com'))).toBe(false)
  })

  it('is about plain http alone', () => {
    expect(isLoopback(new URL('https://127.0.0.1:8545'))).toBe(false)
    expect(isLoopback(new URL('ws://localhost:8545'))).toBe(false)
  })
})

describe('endpointsFrom', () => {
  it('reads a comma-separated list in order, spaces ignored', () => {
    expect(endpointsFrom('https://a.example, https://b.example/v1 ,https://c.example')).toEqual([
      'https://a.example/',
      'https://b.example/v1',
      'https://c.example/',
    ])
  })

  it('reads nothing from an empty record', () => {
    expect(endpointsFrom('')).toEqual([])
  })

  it('drops what is not https, keeping its neighbours', () => {
    expect(
      endpointsFrom('http://a.example,ftp://b.example,not a url,,javascript:alert(1),https://c.example'),
    ).toEqual(['https://c.example/'])
  })

  it('drops what the URL parser would have to repair', () => {
    expect(endpointsFrom('https:rpc.example.org, https:\\\\rpc2.example.org, https://rpc3.example.org\\x, https://rpc4\t.example.org, https:///rpc6.example.org, https://@rpc7.example.org, https://rpc5.example.org'))
      .toEqual(['https://rpc5.example.org/'])
  })

  it('drops every host on this machine or its network', () => {
    const local = [
      'http://127.0.0.1:8545', 'https://127.0.0.1', 'https://localhost', 'https://10.1.2.3', 'https://172.16.0.1',
      'https://172.31.255.255', 'https://192.168.1.1', 'https://169.254.169.254', 'https://100.64.0.1',
      'https://0.0.0.0', 'https://[::1]', 'https://[fd00::1]', 'https://[fe80::1]', 'https://[::ffff:7f00:1]',
      'https://router', 'https://node.local', 'https://rpc.internal', 'https://x.home.arpa', 'https://a.localhost',
    ]
    expect(endpointsFrom([...local, 'https://172.32.0.1', 'https://8.8.8.8', 'https://c.example'].join(','))).toEqual([
      'https://172.32.0.1/',
      'https://8.8.8.8/',
      'https://c.example/',
    ])
  })

  it('tells local hosts from public ones', () => {
    expect(['localhost', '127.0.0.1', '[::1]', 'printer'].every(isLocalHost)).toBe(true)
    // The documentation, 6to4-relay and discard ranges route nowhere public either.
    expect(['192.0.2.1', '198.51.100.7', '203.0.113.9', '192.88.99.1', '[2001:db8::1]', '[100::1]', '[2002:c000:201::1]'].every(isLocalHost)).toBe(true)
    // A trailing dot, NAT64 and the reserved IPv4 ranges are local too.
    expect(['localhost.', 'a.localhost.', 'router.lan.', '[64:ff9b::7f00:1]', '192.0.0.8', '198.18.0.1',
      '198.19.255.255', '224.0.0.1', '239.255.255.250', '255.255.255.255', '[ff02::1]', '[::7f00:1]'].every(isLocalHost)).toBe(true)
    expect(['198.20.0.1', '223.255.255.255', '192.0.3.1', '203.0.114.1', 'rpc.example.'].some(isLocalHost)).toBe(false)
    expect(['rpc.mevblocker.io', '1.1.1.1', '[2606:4700::1111]'].some(isLocalHost)).toBe(false)
  })

  it('drops an endpoint carrying credentials', () => {
    expect(endpointsFrom('https://user:pass@a.example,https://b.example')).toEqual(['https://b.example/'])
  })

  it('collapses repeats and keeps every endpoint, however many', () => {
    const many = Array.from({ length: 40 }, (_, i) => `https://n${i}.example`)
    expect(endpointsFrom(['https://n0.example', ...many].join(','))).toEqual(many.map((u) => `${u}/`))
  })
})

/** A stand-in endpoint: answers eth_chainId with `id`, anything else with `block`, and logs every method. */
function node(id: string, block: string, log: string[], name: string, down = { now: false }) {
  return custom({
    request: async ({ method }: { method: string }) => {
      if (down.now) throw new Error(`${name} is down`)
      log.push(`${name}:${method}`)
      return method === 'eth_chainId' ? id : block
    },
  })
}

describe('onChain', () => {
  const read = (transport: ReturnType<typeof fallback>) =>
    getBlockNumber(createClient({ chain: mainnet, transport, ccipRead: false }), { cacheTime: 0 })

  it('serves once the endpoint answers for the chain, asking only once', async () => {
    const log: string[] = []
    const transport = fallback([onChain(node('0x1', '0x10', log, 'a'), 1)])
    expect(await read(transport)).toBe(16n)
    expect(await read(transport)).toBe(16n)
    expect(log).toEqual(['a:eth_chainId', 'a:eth_blockNumber', 'a:eth_blockNumber'])
  })

  it('passes over an endpoint on another chain, wherever it stands in the list', async () => {
    const log: string[] = []
    const down = { now: false }
    const transport = fallback([
      onChain(node('0x1', '0x10', log, 'a', down), 1),
      onChain(node('0xaa36a7', '0x99', log, 'b'), 1),
      node('0x1', '0x20', log, 'initial'),
    ])
    expect(await read(transport)).toBe(16n)
    down.now = true
    expect(await read(transport)).toBe(32n)
    expect(log.filter((l) => l.startsWith('b:'))).toEqual(['b:eth_chainId'])
  })

  it('passes over an endpoint it could not reach, for good, without asking it again', async () => {
    const log: string[] = []
    const down = { now: true }
    const transport = fallback([onChain(node('0x1', '0x10', log, 'a', down), 1), node('0x1', '0x20', log, 'initial')])
    expect(await read(transport)).toBe(32n)
    down.now = false
    expect(await read(transport)).toBe(32n)
    expect(log.filter((l) => l.startsWith('a:'))).toEqual([])
  })

  it('passes over an endpoint that stops answering after it was trusted, without asking it again', async () => {
    const log: string[] = []
    let down = false
    const dying = custom({
      request: async ({ method }: { method: string }) => {
        log.push(`a:${method}`)
        if (down && method !== 'eth_chainId') throw new HttpRequestError({ url: 'https://a.example', details: 'down' })
        return method === 'eth_chainId' ? '0x1' : '0x10'
      },
    })
    const transport = fallback([onChain(dying, 1), node('0x1', '0x20', log, 'initial')])
    expect(await read(transport)).toBe(16n)
    down = true
    expect(await read(transport)).toBe(32n)
    const asked = log.filter((l) => l.startsWith('a:')).length
    expect(await read(transport)).toBe(32n)
    expect(log.filter((l) => l.startsWith('a:')).length).toBe(asked)
  })

  it('keeps an endpoint whose own answer was an error', async () => {
    const log: string[] = []
    let fail = true
    const picky = custom({
      request: async ({ method }: { method: string }) => {
        log.push(`a:${method}`)
        if (method === 'eth_blockNumber' && fail) { fail = false; throw new Error('execution reverted') }
        return method === 'eth_chainId' ? '0x1' : '0x10'
      },
    })
    const transport = fallback([onChain(picky, 1), node('0x1', '0x20', log, 'initial')])
    await read(transport).catch(() => 0n)
    expect(await read(transport)).toBe(16n)
  })

  it('asks an endpoint again after a transport error when told to retry', async () => {
    const log: string[] = []
    const down = { now: true }
    const transport = fallback([onChain(node('0x1', '0x10', log, 'a', down), 1, undefined, true), node('0x1', '0x20', log, 'initial')])
    expect(await read(transport)).toBe(32n)
    down.now = false
    expect(await read(transport)).toBe(16n)
  })

  it('tells only an endpoint on the chain that it is trusted, and only once', async () => {
    const trusted: string[] = []
    const transport = fallback([
      onChain(node('0xaa36a7', '0x99', [], 'b'), 1, () => trusted.push('b')),
      onChain(node('0x1', '0x10', [], 'a'), 1, () => trusted.push('a')),
    ])
    expect(await read(transport)).toBe(16n)
    expect(await read(transport)).toBe(16n)
    expect(trusted).toEqual(['a'])
  })
})

describe('fetchWhole', () => {
  // Headers at once, then a body that never ends until the request is aborted, erroring with the
  // signal's reason, or, as older engines do, with a plain AbortError.
  const stall = (plainAbort = false) => vi.stubGlobal('fetch', (_input: unknown, init?: RequestInit) => {
    const body = new ReadableStream({
      start: (c) => init?.signal?.addEventListener('abort', () =>
        c.error(plainAbort ? new DOMException('The operation was aborted.', 'AbortError') : init.signal?.reason)),
    })
    return Promise.resolve(new Response(body, { headers: { 'Content-Type': 'application/json' } }))
  })
  const stalled = () => http('https://stall.example', { timeout: 300, retryCount: 0, fetchFn: fetchWhole })
  const read = (transport: ReturnType<typeof fallback> | ReturnType<typeof http>) =>
    getBlockNumber(createClient({ chain: mainnet, transport, ccipRead: false }), { cacheTime: 0 })

  for (const [engine, plainAbort] of [['the signal\'s reason', false], ['a plain AbortError', true]] as const) {
    it(`reads an answer that stalls after its headers as timed out, the body aborted with ${engine}`, async () => {
      stall(plainAbort)
      try {
        const error = await read(stalled()).catch((e: unknown) => e)
        expect((error as BaseError).walk((c) => c instanceof TimeoutError)).not.toBeNull()
      } finally {
        vi.unstubAllGlobals()
      }
    })
  }

  it('passes on an answer with no body, as a status that carries none', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 204 })))
    try {
      const response = await fetchWhole('https://empty.example')
      expect(response.status).toBe(204)
      expect(await response.text()).toBe('')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('gives up on an answer past viem\'s size cap as it arrives, never holding the rest', async () => {
    let sent = 0
    let cancelled = false
    vi.stubGlobal('fetch', () => {
      const body = new ReadableStream({
        pull: (c) => { sent += 1; c.enqueue(new Uint8Array(1_048_576)) },
        cancel: () => { cancelled = true },
      })
      return Promise.resolve(new Response(body, { headers: { 'Content-Type': 'application/json' } }))
    })
    try {
      const error = await read(stalled()).catch((e: unknown) => e)
      expect((error as BaseError).walk((c) => c instanceof HttpRequestError)).not.toBeNull()
      expect(cancelled).toBe(true)
      expect(sent).toBeLessThan(14)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('gives up on an answer that stalls after its headers, and the fallback moves on', async () => {
    stall()
    try {
      const transport = fallback([
        stalled(),
        custom({ request: async ({ method }: { method: string }) => (method === 'eth_chainId' ? '0x1' : '0x20') }),
      ])
      expect(await read(transport)).toBe(32n)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
