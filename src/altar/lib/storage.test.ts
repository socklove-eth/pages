import { afterEach, describe, it, expect, vi } from 'vitest'
import { load, save } from './storage.ts'

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

describe('per-tab storage', () => {
  it('keeps, reads and forgets a value in sessionStorage', () => {
    save('owner', '0xabc')
    expect(sessionStorage.getItem('owner')).toBe('0xabc')
    expect(load('owner')).toBe('0xabc')
    save('owner', null)
    expect(load('owner')).toBeNull()
  })

  it('falls back to memory where the browser blocks storage, for as long as the page is open', () => {
    const blocked = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked)

    expect(load('rpc')).toBeNull()
    save('rpc', 'https://rpc.example')
    expect(load('rpc')).toBe('https://rpc.example')
    save('rpc', null)
    expect(load('rpc')).toBeNull()
  })
})
