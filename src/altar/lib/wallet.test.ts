import { describe, it, expect, vi } from 'vitest'

// wallet.ts reaches the chain module, which reads what the build inlines.
vi.hoisted(() => {
  Object.assign(globalThis, {
    __CONFIG__: { name: 'socklove.eth', label: 'sockthief', registry: '0x0', resolver: '0x0', multiSend: '0x0', safe: '0x0' },
    __RPC_URLS__: [],
  })
})

const { isPending, wasDeclined } = await import('./wallet.ts')

describe('wallet errors', () => {
  it('reads a refusal by its code or its name', () => {
    expect(wasDeclined({ code: 4001 })).toBe(true)
    expect(wasDeclined({ name: 'UserRejectedRequestError' })).toBe(true)
    expect(wasDeclined({ code: -32603 })).toBe(false)
    expect(wasDeclined(null)).toBe(false)
    expect(wasDeclined('4001')).toBe(false)
  })

  it('reads a request already open in the wallet', () => {
    expect(isPending({ code: -32002 })).toBe(true)
    expect(isPending({ code: 4001 })).toBe(false)
  })

  it('finds the code through the cause chain, as viem wraps it', () => {
    expect(wasDeclined({ cause: { cause: { code: 4001 } } })).toBe(true)
    expect(isPending(new Error('wrapped', { cause: { code: -32002 } }))).toBe(true)
  })

  it('stops on a cycle, and past eight levels', () => {
    const loop: { cause?: unknown } = {}
    loop.cause = loop
    expect(wasDeclined(loop)).toBe(false)

    let deep: { cause?: unknown; code?: number } = { code: 4001 }
    for (let i = 0; i < 8; i++) deep = { cause: deep }
    expect(wasDeclined(deep)).toBe(false)
  })
})
