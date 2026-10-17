// @vitest-environment node
import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serve } from './serve.mjs'

let dir: string
let server: Server
let base: string

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'serve-'))
  mkdirSync(join(dir, 'page'))
  writeFileSync(join(dir, 'index.html'), '<p>index</p>')
  writeFileSync(join(dir, 'page', 'index.html'), '<p>page</p>')
  writeFileSync(join(dir, 'a.svg'), '<svg/>')
  writeFileSync(join(dir, 'a.css'), 'p{}')
  mkdirSync(`${dir}-sibling`)
  writeFileSync(join(`${dir}-sibling`, 'secret'), 'secret')
  server = serve(dir, 0)
  await once(server, 'listening')
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
  rmSync(dir, { recursive: true, force: true })
  rmSync(`${dir}-sibling`, { recursive: true, force: true })
})

const get = (path: string) => fetch(base + path, { redirect: 'manual' })

describe('serve', () => {
  it("answers / with the directory's own index.html", async () => {
    const res = await get('/')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('<p>index</p>')
  })

  it("serves a directory's index.html, never cached", async () => {
    const res = await get('/page/')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.text()).toBe('<p>page</p>')
  })

  it('redirects a directory to its trailing slash', async () => {
    const res = await get('/page')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/page/')
  })

  it('types files by extension, and ignores a query', async () => {
    const res = await get('/a.svg?x=1')
    expect(res.headers.get('content-type')).toBe('image/svg+xml')
    expect((await get('/a.css')).headers.get('content-type')).toBe('text/css')
  })

  it('listens on loopback by default', () => {
    expect((server.address() as AddressInfo).address).toBe('127.0.0.1')
  })

  it('answers 404 for a missing file', async () => {
    expect((await get('/missing')).status).toBe(404)
  })

  it('never serves outside its directory', async () => {
    expect((await get('/../' + dir.split('/').pop() + '-sibling/secret')).status).toBe(404)
    expect((await get('/%2e%2e/%2e%2e/etc/passwd')).status).toBe(404)
  })

  it('answers 400 for a malformed path', async () => {
    expect((await get('/%E0%A4%A')).status).toBe(400)
  })
})
